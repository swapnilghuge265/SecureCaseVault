// Audit Logs — the append-only security history, admin-only.
//
// The table has NO update or delete paths anywhere in the application, and
// a database trigger (installed by scripts/seed.mjs) blocks UPDATE/DELETE
// even at the SQL level — see the "append-only" notes in src/lib/audit.ts.

import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { ROLE_META } from "@/lib/format";
import AuditClient, { type LogRow } from "@/components/audit-client";
import { AccessDenied, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Audit Logs" };

export default async function AuditPage() {
  const { user } = await requireUser();

  if (!can(user.role, "viewAudit")) {
    return (
      <AccessDenied
        message={`The full audit log is restricted to administrators. You are signed in as ${
          ROLE_META[user.role]?.label ?? user.role
        }. Your own recent activity is still visible on your dashboard.`}
      />
    );
  }

  // The most recent 1000 events; everything older remains in the database
  // (the UI just doesn't page back further in this prototype).
  const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1000);

  const logs: LogRow[] = rows.map((r) => ({
    id: r.id,
    username: r.username,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    detail: r.detail,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    success: r.success,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Audit Logs"
        sub="Append-only history of sign-ins, document activity, case changes, permission changes and alerts."
      />
      <AuditClient logs={logs} />
    </>
  );
}
