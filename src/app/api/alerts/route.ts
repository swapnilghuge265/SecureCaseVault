// PATCH /api/alerts
// { id, status: "acknowledged" | "resolved" } — administrators only.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { securityAlerts } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logPermissionDenied } from "@/lib/detection";

// Alert lifecycle: new → investigating → resolved
const ALLOWED = ["investigating", "resolved"];

export async function PATCH(req: Request) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "manageAlerts")) {
    await logPermissionDenied(session.user, req, "updating security alerts");
    return Response.json({ error: "Only administrators can update alerts." }, { status: 403 });
  }

  let body: { id?: number; status?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "Missing alert id." }, { status: 400 });
  if (!body.status || !ALLOWED.includes(body.status))
    return Response.json({ error: "Invalid alert status." }, { status: 400 });

  const [alert] = await db.select().from(securityAlerts).where(eq(securityAlerts.id, id));
  if (!alert) return Response.json({ error: "Alert not found." }, { status: 404 });

  await db.update(securityAlerts).set({ status: body.status }).where(eq(securityAlerts.id, id));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "alert_update",
      resourceType: "alert",
      resourceId: String(id),
      detail: `Alert "${alert.title}" marked as ${body.status}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}
