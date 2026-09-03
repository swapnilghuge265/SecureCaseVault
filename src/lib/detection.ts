// ---------------------------------------------------------------------------
// Rule-based security monitoring (prototype).
//
// This is a deliberately SIMPLE set of counting rules over the audit log —
// the same approach a first SIEM deployment uses before any analytics.
// No machine learning; every rule is a threshold an administrator can read
// and adjust in one place (the RULES table below).
//
// ┌──────────────────────────────────────────────────────┬──────────┬─────────────────┐
// │ Rule   │ Condition (rolling window)                   │ Severity │ Alert type      │
// ├────────┼──────────────────────────────────────────────┼──────────┼─────────────────┤
// │ R1     │ 3+ failed logins for one account (15 min)    │ high     │ failed_logins   │
// │ R2     │ 5+ failed logins from one IP, any account    │ high     │ ip_failed_logins│
// │        │ (15 min) — often credential stuffing         │          │                 │
// │ R3     │ 3+ logins for a NONEXISTENT account from one │ high     │ unknown_account │
// │        │ IP (15 min) — account enumeration            │          │                 │
// │ R4     │ 8+ document downloads by one user (5 min)    │ critical │ bulk_download   │
// │ R5     │ 5+ unauthorized document-access attempts by  │ high     │ unauthorized_   │
// │        │ one user (15 min)                            │          │ access          │
// │ R6     │ 10+ permission-denied requests by one user   │ medium   │ repeated_denied │
// │        │ (15 min)                                     │          │                 │
// │ R7     │ 25+ document views by one user (60 min)      │ medium   │ high_access_    │
// │        │ — unusual access volume                      │          │ volume          │
// └────────┴──────────────────────────────────────────────┴──────────┴─────────────────┘
//
// Every alert is de-duplicated: if an open alert of the same type already
// exists for the same user/IP inside the window, no second alert is raised.
// Raising an alert also writes an "alert_created" audit entry (in alerts.ts).
//
// IMPORTANT — this is prototype monitoring, not a production SIEM. The UI
// says so, and the thresholds are starting points, not tuned detection.
// ---------------------------------------------------------------------------

import { and, eq, gte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, securityAlerts } from "@/db/schema";
import { raiseAlert, type AlertActor } from "./alerts";
import { logAudit } from "./audit";
import { clientIp } from "./auth";

const MIN = 60_000;

// --- Small counting helpers over the append-only audit log -------------------

async function countUserActions(action: string, username: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, action), eq(auditLogs.username, username), gte(auditLogs.createdAt, since)));
  return Number(r?.n ?? 0);
}

async function countIpActions(action: string, ip: string, since: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(eq(auditLogs.action, action), eq(auditLogs.ipAddress, ip), gte(auditLogs.createdAt, since)));
  return Number(r?.n ?? 0);
}

// De-duplication: skip if an OPEN (new / investigating) alert of this type
// already exists for this user or IP inside the window.
async function openAlertExists(type: string, since: Date, userId?: number, ip?: string): Promise<boolean> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(securityAlerts)
    .where(
      and(
        eq(securityAlerts.type, type),
        gte(securityAlerts.createdAt, since),
        or(eq(securityAlerts.status, "new"), eq(securityAlerts.status, "investigating")),
        ip
          ? or(eq(securityAlerts.ipAddress, ip), userId ? eq(securityAlerts.userId, userId) : eq(securityAlerts.userId, -1))
          : userId
            ? eq(securityAlerts.userId, userId)
            : sql`false`,
      ),
    );
  return Number(r?.n ?? 0) > 0;
}

// --- R1 + R2 + R3: failed-login detection --------------------------------------
// Called on every failed sign-in. `accountExists` tells us whether the typed
// username matches a real account (R3 needs that distinction).

export async function checkFailedLoginRules(username: string, ip: string, accountExists: boolean): Promise<void> {
  const since = new Date(Date.now() - 15 * MIN);

  // R1 — one account targeted repeatedly.
  const forAccount = await countUserActions("login_failed", username, since);
  if (forAccount >= 3 && !(await openAlertExists("failed_logins", since, undefined, ip))) {
    await raiseAlert(
      {
        type: "failed_logins",
        severity: "high",
        title: "Multiple failed login attempts",
        message: `${forAccount} failed sign-in attempts for "${username}" from ${ip} within 15 minutes.`,
        ip,
        resourceType: "user",
      },
      { username, ip },
    );
  }

  // R2 — one IP hammering logins across accounts (credential stuffing).
  const fromIp = await countIpActions("login_failed", ip, since);
  if (fromIp >= 5 && !(await openAlertExists("ip_failed_logins", since, undefined, ip))) {
    await raiseAlert(
      {
        type: "ip_failed_logins",
        severity: "high",
        title: "Failed logins from a single IP",
        message: `${fromIp} failed sign-in attempts from ${ip} across accounts within 15 minutes — possible credential stuffing.`,
        ip,
      },
      { username, ip },
    );
  }

  // R3 — probing for accounts that do not exist (enumeration).
  if (!accountExists) {
    const unknown = await countUserActions("login_failed", username, since);
    if (unknown >= 3 && !(await openAlertExists("unknown_account", since, undefined, ip))) {
      await raiseAlert(
        {
          type: "unknown_account",
          severity: "high",
          title: "Login attempts against a nonexistent account",
          message: `${unknown} sign-in attempts for the unknown username "${username}" from ${ip} within 15 minutes — possible account enumeration.`,
          ip,
        },
        { username, ip },
      );
    }
  }
}

// --- R4: bulk downloads ---------------------------------------------------------

export async function checkBulkDownloadRules(user: { id: number; username: string }, ip: string): Promise<void> {
  const since = new Date(Date.now() - 5 * MIN);
  const n = await countUserActions("document_download", user.username, since);
  if (n >= 8 && !(await openAlertExists("bulk_download", since, user.id, ip))) {
    await raiseAlert(
      {
        type: "bulk_download",
        severity: "critical",
        title: "Unusual download activity",
        message: `${user.username} downloaded ${n} documents within 5 minutes from ${ip}.`,
        userId: user.id,
        ip,
        resourceType: "user",
        resourceId: String(user.id),
      },
      { userId: user.id, username: user.username, ip },
    );
  }
}

// --- R5: repeated unauthorized document access -----------------------------------
// Called when an authenticated user is DENIED access to a specific document.
// The denied attempt itself is also written to the audit log (success=false).

export async function logDocumentAccessDenied(
  user: { id: number; username: string },
  req: Request,
  docName: string,
): Promise<void> {
  const ip = clientIp(req);
  await logAudit(
    {
      userId: user.id,
      username: user.username,
      action: "document_access_denied",
      detail: `Attempted to access ${docName} without permission`,
      ip,
      success: false,
    },
    req,
  );

  const since = new Date(Date.now() - 15 * MIN);
  const n = await countUserActions("document_access_denied", user.username, since);
  if (n >= 5 && !(await openAlertExists("unauthorized_access", since, user.id, ip))) {
    await raiseAlert(
      {
        type: "unauthorized_access",
        severity: "high",
        title: "Repeated unauthorized document access",
        message: `${user.username} attempted to open documents they do not have access to ${n} times within 15 minutes (from ${ip}).`,
        userId: user.id,
        ip,
        resourceType: "user",
        resourceId: String(user.id),
      },
      { userId: user.id, username: user.username, ip },
    );
  }
}

// --- R6: repeated permission-denied requests -------------------------------------
// Generic 403 feeder for role-permission rejections across the API.

export async function logPermissionDenied(
  user: { id: number; username: string },
  req: Request,
  what: string,
): Promise<void> {
  const ip = clientIp(req);
  await logAudit(
    {
      userId: user.id,
      username: user.username,
      action: "permission_denied",
      detail: `Permission denied: ${what}`,
      ip,
      success: false,
    },
    req,
  );

  const since = new Date(Date.now() - 15 * MIN);
  const n = await countUserActions("permission_denied", user.username, since);
  if (n >= 10 && !(await openAlertExists("repeated_denied", since, user.id, ip))) {
    await raiseAlert(
      {
        type: "repeated_denied",
        severity: "medium",
        title: "Repeated permission-denied requests",
        message: `${user.username} triggered ${n} permission-denied responses within 15 minutes (from ${ip}).`,
        userId: user.id,
        ip,
        resourceType: "user",
        resourceId: String(user.id),
      },
      { userId: user.id, username: user.username, ip },
    );
  }
}

// --- R7: unusual document access volume -------------------------------------------

export async function checkAccessVolumeRules(user: { id: number; username: string }, ip: string): Promise<void> {
  const since = new Date(Date.now() - 60 * MIN);
  const n = await countUserActions("document_view", user.username, since);
  if (n >= 25 && !(await openAlertExists("high_access_volume", since, user.id, ip))) {
    await raiseAlert(
      {
        type: "high_access_volume",
        severity: "medium",
        title: "Unusual document access volume",
        message: `${user.username} viewed ${n} documents within 60 minutes (from ${ip}).`,
        userId: user.id,
        ip,
        resourceType: "user",
        resourceId: String(user.id),
      },
      { userId: user.id, username: user.username, ip },
    );
  }
}

export type { AlertActor };
