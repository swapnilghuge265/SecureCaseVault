// ---------------------------------------------------------------------------
// Audit logging service — the append-only security history.
//
// Every security-sensitive action goes through logAudit():
//   login / logout / failed login / register
//   document upload / download / view / delete / share / unshare
//   case create / update / delete
//   permission changes (user role changes, share grants)
//   user creation, profile & password changes
//   security alert creation
//
// APPEND-ONLY, enforced two ways:
//   1. The application only ever INSERTs into audit_logs — there are no
//      routes, functions or UI controls that update or delete rows.
//   2. A database trigger (created by scripts/seed.mjs) raises an error on
//      any UPDATE or DELETE, so even a direct SQL connection cannot modify
//      the history. The trigger is on the table itself, outside the app.
//
// Fields recorded per event: id, user (id + denormalized username), action,
// resource type + id, timestamp (DB default), IP address, user agent,
// success/failure and a human-readable description.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { clientIp } from "./auth";

export interface AuditEntry {
  userId?: number | null;
  username?: string | null;
  action: string; // e.g. "document_upload", "login_failed", "user_role_change"
  resourceType?: string | null; // e.g. "document", "case", "alert"
  resourceId?: string | null;
  detail?: string | null;
  ip?: string | null;
  // Omit (defaults to true) for actions that always succeed; set false for
  // failed attempts such as bad logins.
  success?: boolean;
}

const MAX_USER_AGENT = 255;

function userAgentOf(req?: Request): string | null {
  if (!req) return null;
  const ua = req.headers.get("user-agent") ?? "";
  return ua.length > 0 ? ua.slice(0, MAX_USER_AGENT) : null;
}

export async function logAudit(entry: AuditEntry, req?: Request): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: entry.userId ?? null,
      username: entry.username ?? null,
      action: entry.action,
      resourceType: entry.resourceType ?? null,
      resourceId: entry.resourceId ?? null,
      detail: entry.detail ?? null,
      ipAddress: entry.ip ?? (req ? clientIp(req) : null),
      userAgent: userAgentOf(req),
      success: entry.success ?? true,
    });
  } catch (err) {
    // Logging must never break the main action — just console.error.
    console.error("Failed to write audit log", err);
  }
}
