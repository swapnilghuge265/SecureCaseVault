import { eq } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { can, requireApiUser } from "@/lib/auth";

export async function POST(req: Request) {
  const auth = await requireApiUser(req);

  if (!auth) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!can(auth.user.role, "manageUsers")) {
    return Response.json(
      { error: "Only administrators can revoke sessions." },
      { status: 403 },
    );
  }

  let body: { username?: string };

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const username = (body.username ?? "").trim();

  if (!username) {
    return Response.json(
      { error: "Username is required." },
      { status: 400 },
    );
  }

  const [targetUser] = await db
    .select({
      id: users.id,
      username: users.username,
    })
    .from(users)
    .where(eq(users.username, username));

  if (!targetUser) {
    return Response.json(
      { error: "User not found." },
      { status: 404 },
    );
  }

  if (targetUser.id === auth.user.id) {
    return Response.json(
      { error: "You cannot revoke your own current sessions." },
      { status: 400 },
    );
  }

  const revoked = await db
    .delete(sessions)
    .where(eq(sessions.userId, targetUser.id))
    .returning({ id: sessions.id });

  return Response.json({
    ok: true,
    username: targetUser.username,
    revokedCount: revoked.length,
  });
}
