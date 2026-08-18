import { createLocalSession, deleteSession, getSession } from "@/db/workspace-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSession(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json({ user });
}

export async function POST(request: Request) {
  const input = (await request.json()) as {
    email?: string;
    displayName?: string;
    ageConfirmed?: boolean;
  };
  const email = input.email?.trim().toLowerCase() ?? "";
  const displayName = input.displayName?.trim() ?? "";
  if (!input.ageConfirmed) {
    return Response.json({ error: "Homework Helper is currently available only to students age 13+." }, { status: 400 });
  }
  if (!displayName || !/^\S+@\S+\.\S+$/.test(email)) {
    return Response.json({ error: "Enter a name and valid email address." }, { status: 400 });
  }
  const session = await createLocalSession({ email, displayName });
  return Response.json(
    { user: session.user },
    { headers: { "set-cookie": session.cookie } },
  );
}

export async function DELETE(request: Request) {
  const cookie = await deleteSession(request);
  return Response.json({ ok: true }, { headers: { "set-cookie": cookie } });
}
