// PATCH /api/users/:id
// { role? , status? } — administrator only.
//
// Security decisions:
//  * Only the `manageUsers` permission may reach this route.
//  * An admin cannot change their OWN role/status here — this prevents
//    accidentally (or maliciously) locking out every administrator.
//  * Role changes are audited as "user_role_change" (a permission change —
//    a high-signal event) and additionally raise a HIGH severity alert.
//  * Status changes (suspend/reactivate) are audited as "user_update".
//  * Suspending a user takes effect immediately: getSessionUser() checks
//    the account status on every request, so their active sessions die.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { logPermissionDenied } from "@/lib/detection";

const ROLES = ["administrator", "investigator", "legal_officer", "viewer"];
const STATUSES = ["active", "suspended"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "manageUsers")) {
    await logPermissionDenied(session.user, req, "managing user accounts");
    return Response.json({ error: "Only administrators can manage user accounts." }, { status: 403 });
  }

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isInteger(targetId)) return Response.json({ error: "Invalid user id." }, { status: 400 });

  // No self-modification — see note at the top of this file.
  if (targetId === session.user.id)
    return Response.json(
      { error: "You cannot change your own role or status here. Ask another administrator." },
      { status: 403 },
    );

  const [target] = await db.select().from(users).where(eq(users.id, targetId));
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });

  let body: { role?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const changes: Partial<typeof users.$inferInsert> = {};
  const parts: string[] = [];
  let roleChanged = false;

  if (body.role) {
    if (!ROLES.includes(body.role)) return Response.json({ error: "Unknown role." }, { status: 400 });
    if (body.role !== target.role) {
      changes.role = body.role;
      parts.push(`role ${target.role} → ${body.role}`);
      roleChanged = true;
    }
  }
  if (body.status) {
    if (!STATUSES.includes(body.status)) return Response.json({ error: "Unknown status." }, { status: 400 });
    if (body.status !== target.status) {
      changes.status = body.status;
      parts.push(`status ${target.status} → ${body.status}`);
    }
  }

  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  await db.update(users).set(changes).where(eq(users.id, targetId));

  // Permission changes and account status changes are audited as separate,
  // explicit events — both append-only.
  const actor = { userId: session.user.id, username: session.user.username, ip: clientIp(req) };

  if (roleChanged) {
    await raiseAlert(
      {
        type: "privilege_change",
        severity: "high",
        title: "User role changed",
        message: `${target.username}'s role changed from ${target.role} to ${body.role} by ${session.user.username}.`,
        userId: targetId,
        ip: clientIp(req),
      },
      actor,
    );
    await logAudit(
      {
        ...actor,
        action: "user_role_change",
        resourceType: "user",
        resourceId: String(targetId),
        detail: `Role for ${target.username}: ${target.role} → ${body.role}`,
        success: true,
      },
      req,
    );
  }

  if (body.status && body.status !== target.status) {
    await logAudit(
      {
        ...actor,
        action: "user_update",
        resourceType: "user",
        resourceId: String(targetId),
        detail: `Status for ${target.username}: ${target.status} → ${body.status}`,
        success: true,
      },
      req,
    );
  }

  return Response.json({ ok: true, changes: parts });
}
