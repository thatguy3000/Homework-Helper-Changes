import { deleteAccount, getSession, readWorkspace, writeWorkspace } from "@/db/workspace-store";
import type { WorkspaceSnapshot } from "@/app/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json(await readWorkspace(user.id));
}

export async function PUT(request: Request) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const input = (await request.json()) as {
    workspace?: WorkspaceSnapshot;
    expectedVersion?: number;
  };
  if (!input.workspace || input.workspace.schemaVersion !== 1 || !Number.isInteger(input.expectedVersion)) {
    return Response.json({ error: "Invalid workspace payload" }, { status: 400 });
  }
  const result = await writeWorkspace(user.id, input.workspace, input.expectedVersion ?? 0);
  if (result.conflict) return Response.json(result, { status: 409 });
  return Response.json(result);
}

export async function DELETE(request: Request) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  await deleteAccount(user.id);
  return Response.json(
    { ok: true },
    { headers: { "set-cookie": "hh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" } },
  );
}
