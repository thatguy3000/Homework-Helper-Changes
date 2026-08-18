import type { SessionUser, WorkspaceSnapshot } from "@/app/lib/types";

const SESSION_COOKIE = "hh_session";
const SESSION_LENGTH_SECONDS = 60 * 60 * 24 * 30;

type AppEnv = {
  DB?: DatabaseAdapter;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

type DatabaseValue = string | number | bigint | null | Uint8Array;

interface DatabaseStatement {
  bind(...values: DatabaseValue[]): DatabaseStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

interface DatabaseAdapter {
  prepare(sql: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<unknown>;
}

type RuntimeGlobal = typeof globalThis & {
  __HOMEWORK_HELPER_RUNTIME_ENV__?: AppEnv;
};

export function getRuntimeEnv() {
  const runtime = (globalThis as RuntimeGlobal).__HOMEWORK_HELPER_RUNTIME_ENV__;
  if (runtime) return runtime;
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  } satisfies AppEnv;
}

let nodeDatabase: Promise<DatabaseAdapter> | null = null;

async function createNodeDatabase(): Promise<DatabaseAdapter> {
  const [{ DatabaseSync }, fileSystem, path] = await Promise.all([
    import("node:sqlite"),
    import("node:fs"),
    import("node:path"),
  ]);
  const dataDirectory = path.resolve(process.cwd(), "data");
  fileSystem.mkdirSync(dataDirectory, { recursive: true });
  const databasePath = process.env.HOMEWORK_HELPER_DB_PATH
    ? path.resolve(process.env.HOMEWORK_HELPER_DB_PATH)
    : path.join(dataDirectory, "homework-helper.sqlite");
  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA foreign_keys = ON");
  return {
    prepare(sql: string) {
      let boundValues: DatabaseValue[] = [];
      const wrapper: DatabaseStatement = {
        bind(...values: DatabaseValue[]) {
          boundValues = values;
          return wrapper;
        },
        async first<T>() {
          const statement = sqlite.prepare(sql);
          return (statement.get(...boundValues) as T | undefined) ?? null;
        },
        async run() {
          const statement = sqlite.prepare(sql);
          return statement.run(...boundValues);
        },
      };
      return wrapper;
    },
    async batch(statements: DatabaseStatement[]) {
      for (const statement of statements) await statement.run();
      return [];
    },
  };
}

async function database(): Promise<DatabaseAdapter> {
  const d1 = getRuntimeEnv().DB;
  if (d1) return d1;
  nodeDatabase ??= createNodeDatabase();
  return nodeDatabase;
}

let initialized: Promise<void> | null = null;

export function ensureDatabase() {
  if (!initialized) {
    initialized = (async () => {
      const db = await database();
      await db.batch([
        db.prepare(`CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          age_confirmed INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
        db.prepare(`CREATE TABLE IF NOT EXISTS workspace_snapshots (
          user_id TEXT PRIMARY KEY,
          payload TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)"),
        db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)"),
      ]);
    })().catch((error) => {
        initialized = null;
        throw error;
      });
  }
  return initialized;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function getSession(request: Request): Promise<SessionUser | null> {
  await ensureDatabase();
  const db = await database();
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await db
    .prepare(`SELECT users.id, users.email, users.display_name AS displayName
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = ? AND sessions.expires_at > ?`)
    .bind(token, now)
    .first<SessionUser>();
  return row ?? null;
}

export async function createLocalSession(input: {
  email: string;
  displayName: string;
}) {
  await ensureDatabase();
  const db = await database();
  const now = new Date();
  const existing = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(input.email)
    .first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  const createdAt = now.toISOString();
  await db
    .prepare(`INSERT INTO users (id, email, display_name, age_confirmed, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
      ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at`)
    .bind(id, input.email, input.displayName, createdAt, createdAt)
    .run();

  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  const expiresAt = new Date(now.getTime() + SESSION_LENGTH_SECONDS * 1000).toISOString();
  await db
    .prepare("INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(token, id, expiresAt, createdAt)
    .run();

  return {
    user: { id, email: input.email, displayName: input.displayName } satisfies SessionUser,
    cookie: `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_LENGTH_SECONDS}`,
  };
}

export async function deleteSession(request: Request) {
  await ensureDatabase();
  const db = await database();
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function readWorkspace(userId: string) {
  await ensureDatabase();
  const db = await database();
  const row = await db
    .prepare("SELECT payload, version, updated_at AS updatedAt FROM workspace_snapshots WHERE user_id = ?")
    .bind(userId)
    .first<{ payload: string; version: number; updatedAt: string }>();
  if (!row) return { workspace: null, version: 0, updatedAt: null };
  return {
    workspace: JSON.parse(row.payload) as WorkspaceSnapshot,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export async function writeWorkspace(
  userId: string,
  workspace: WorkspaceSnapshot,
  expectedVersion: number,
) {
  await ensureDatabase();
  const db = await database();
  const current = await readWorkspace(userId);
  if (current.version !== expectedVersion) return { conflict: true as const, ...current };
  const version = expectedVersion + 1;
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify({ ...workspace, updatedAt });
  if (payload.length > 2_500_000) throw new Error("Workspace data exceeds the 2.5 MB safety limit.");
  await db
    .prepare(`INSERT INTO workspace_snapshots (user_id, payload, version, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload, version = excluded.version, updated_at = excluded.updated_at`)
    .bind(userId, payload, version, updatedAt)
    .run();
  return { conflict: false as const, version, updatedAt };
}

export async function deleteAccount(userId: string) {
  await ensureDatabase();
  const db = await database();
  await db.batch([
    db.prepare("DELETE FROM workspace_snapshots WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
}
