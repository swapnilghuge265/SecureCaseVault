// PATCH /api/profile
// Updates the signed-in user's display name, email and/or notification
// preferences. Each request may include any subset of those fields.

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: Request) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });

  let body: {
    fullName?: string;
    email?: string;
    notifySecurity?: boolean;
    notifyDigest?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const changes: Partial<typeof users.$inferInsert> = {};
  const parts: string[] = [];

  if (typeof body.fullName === "string") {
    const name = body.fullName.trim();
    if (name.length < 2) return Response.json({ error: "Name must be at least 2 characters." }, { status: 400 });
    if (name !== session.user.fullName) {
      changes.fullName = name;
      parts.push("name");
    }
  }

  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, session.user.id)));
    if (taken) return Response.json({ error: "That email is already in use." }, { status: 409 });
    if (email !== session.user.email) {
      changes.email = email;
      parts.push("email");
    }
  }

  if (typeof body.notifySecurity === "boolean" && body.notifySecurity !== session.user.notifySecurity) {
    changes.notifySecurity = body.notifySecurity;
    parts.push(`security alerts ${body.notifySecurity ? "on" : "off"}`);
  }
  if (typeof body.notifyDigest === "boolean" && body.notifyDigest !== session.user.notifyDigest) {
    changes.notifyDigest = body.notifyDigest;
    parts.push(`weekly digest ${body.notifyDigest ? "on" : "off"}`);
  }

  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  await db.update(users).set(changes).where(eq(users.id, session.user.id));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "profile_update",
      detail: `Profile updated: ${parts.join(", ") || "preferences"}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}
