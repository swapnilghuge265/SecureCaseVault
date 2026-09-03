// ---------------------------------------------------------------------------
// Security alerts service.
//
// The app automatically raises alerts for events that an administrator
// should review: repeated failed logins, sensitive document uploads,
// unusual downloads, user role changes and new account registrations.
//
// Raising an alert is itself a security-sensitive event — every alert
// creation is written to the audit log (action "alert_created"), so the
// history shows exactly when and why each alert appeared.
// ---------------------------------------------------------------------------

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { securityAlerts } from "@/db/schema";
import { logAudit } from "./audit";

export interface AlertInput {
  type: string; // e.g. "failed_logins", "sensitive_upload"
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message?: string | null;
  userId?: number | null;
  ip?: string | null;
  // Related resource (optional): what object this alert is about.
  resourceType?: string | null;
  resourceId?: string | null;
}

/** Who caused the alert (for the audit entry); null for system events. */
export interface AlertActor {
  userId?: number | null;
  username?: string | null;
  ip?: string | null;
}

export async function raiseAlert(alert: AlertInput, actor?: AlertActor) {
  const [inserted] = await db
    .insert(securityAlerts)
    .values({
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message ?? null,
      userId: alert.userId ?? null,
      ipAddress: alert.ip ?? null,
      resourceType: alert.resourceType ?? null,
      resourceId: alert.resourceId ?? null,
      status: "new",
    })
    .returning();

  // Audit the alert creation (append-only, with the triggering context).
  await logAudit({
    userId: actor?.userId ?? null,
    username: actor?.username ?? null,
    action: "alert_created",
    resourceType: "alert",
    resourceId: String(inserted.id),
    detail: `Alert raised: ${alert.title}`,
    ip: actor?.ip ?? null,
    success: true,
  });

  return inserted;
}
