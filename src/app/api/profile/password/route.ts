// POST /api/profile/password
// { current, next } — verifies the current password before replacing it.

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: { current?: string; next?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const current = body.current ?? "";
  const next = body.next ?? "";

  if (next.length < 8 || !/[a-zA-Z]/.test(next) || !/\d/.test(next))
    return Response.json(
      { error: "New password must be at least 8 characters and include letters and numbers." },
      { status: 400 },
    );

  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, session.user.id));
  const currentOk = row ? await bcrypt.compare(current, row.passwordHash) : false;
  if (!currentOk) return Response.json({ error: "Current password is incorrect." }, { status: 400 });

  const passwordHash = await bcrypt.hash(next, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, session.user.id));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "password_change",
      detail: "Password changed",
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}
