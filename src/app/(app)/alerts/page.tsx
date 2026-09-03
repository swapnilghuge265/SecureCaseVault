// Security Alerts dashboard — the face of the rule-based monitoring system.
//
// Shows: total alerts, critical, high, new (open), a 14-day trend and the
// recent alerts with their review workflow (New → Investigating → Resolved).
// A visible banner makes clear this is PROTOTYPE monitoring: simple counting
// rules (src/lib/detection.ts), not a production SIEM.

import type { Metadata } from "next";
import { count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { securityAlerts, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { ROLE_META } from "@/lib/format";
import AlertsClient, { type AlertRow } from "@/components/alerts-client";
import { AccessDenied, PageHeader, StatCard } from "@/components/ui";
import { IconAlert, IconBell } from "@/components/icons";

export const metadata: Metadata = { title: "Security Alerts" };

const DAY = 86_400_000;

export default async function AlertsPage() {
  const { user } = await requireUser();

  if (!can(user.role, "manageAlerts")) {
    return (
      <AccessDenied
        message={`Reviewing and managing security alerts requires the Administrator role. You are signed in as ${
          ROLE_META[user.role]?.label ?? user.role
        }.`}
      />
    );
  }

  const now = new Date();
const trendSince = new Date(now.getTime() - 13 * DAY);

  const [alertRows, userRows, totalR, criticalR, highR, newR, trendRows] = await Promise.all([
    db.select().from(securityAlerts).orderBy(desc(securityAlerts.createdAt)).limit(100),
    db.select({ id: users.id, username: users.username }).from(users),
    db.select({ n: count() }).from(securityAlerts),
    db.select({ n: count() }).from(securityAlerts).where(eq(securityAlerts.severity, "critical")),
    db.select({ n: count() }).from(securityAlerts).where(eq(securityAlerts.severity, "high")),
    db.select({ n: count() }).from(securityAlerts).where(eq(securityAlerts.status, "new")),
    db
      .select({
        day: sql<string>`to_char(${securityAlerts.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
        n: sql<number>`count(*)`,
      })
      .from(securityAlerts)
      .where(gte(securityAlerts.createdAt, trendSince))
      .groupBy(sql`to_char(${securityAlerts.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`),
  ]);

  const userMap = new Map(userRows.map((u) => [u.id, u.username]));

  const alerts: AlertRow[] = alertRows.map((a) => ({
    id: a.id,
    type: a.type,
    severity: a.severity,
    title: a.title,
    message: a.message,
    username: userMap.get(a.userId ?? -1) ?? null,
    ipAddress: a.ipAddress,
    resourceType: a.resourceType,
    resourceId: a.resourceId,
    status: a.status,
    createdAt: a.createdAt.toISOString(),
  }));

  // Zero-fill the last 14 UTC days for the trend chart.
  const dayMap = new Map(trendRows.map((r) => [r.day, Number(r.n)]));
  const trend: { key: string; label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    const key = d.toISOString().slice(0, 10);
    trend.push({
      key,
      label: d.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }),
      count: dayMap.get(key) ?? 0,
    });
  }
  const maxCount = Math.max(1, ...trend.map((t) => t.count));
  const trendTotal = trend.reduce((s, t) => s + t.count, 0);

  return (
    <>
      <PageHeader
        title="Security Alerts"
        sub="Rule-based monitoring: failed logins, bulk downloads, denied access, access volume and more."
      />

      {/* Prototype disclaimer — monitoring is intentionally simple */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 anim-rise">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p className="text-xs leading-relaxed text-amber-100/90">
          <span className="font-bold uppercase tracking-wide">Prototype security monitoring.</span> Detection is
          a fixed set of simple counting rules over the audit log (thresholds in{" "}
          <span className="font-mono">src/lib/detection.ts</span>). This is a learning prototype — not a
          production SIEM and not a substitute for real threat detection.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Total Alerts"
          value={Number(totalR[0]?.n ?? 0)}
          sub="All time"
          tone="cyan"
          icon={<IconBell className="h-5 w-5" />}
          delay="anim-rise-1"
        />
        <StatCard
          label="Critical"
          value={Number(criticalR[0]?.n ?? 0)}
          sub="Highest severity"
          tone="rose"
          icon={<IconAlert className="h-5 w-5" />}
          delay="anim-rise-1"
        />
        <StatCard
          label="High"
          value={Number(highR[0]?.n ?? 0)}
          sub="Second severity tier"
          tone="amber"
          icon={<IconAlert className="h-5 w-5" />}
          delay="anim-rise-2"
        />
        <StatCard
          label="New / Untriaged"
          value={Number(newR[0]?.n ?? 0)}
          sub="Awaiting first review"
          tone="blue"
          icon={<IconBell className="h-5 w-5" />}
          delay="anim-rise-2"
        />
      </div>

      {/* 14-day trend */}
      <div className="card mt-4 p-5 anim-rise-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">Alert trend — last 14 days</h2>
          <p className="text-xs text-mut-2">{trendTotal} alert{trendTotal === 1 ? "" : "s"} in period</p>
        </div>
        <div className="mt-4 flex h-36 items-end gap-1.5">
          {trend.map((t) => (
            <div
              key={t.key}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1"
              title={`${t.label}: ${t.count} alert${t.count === 1 ? "" : "s"}`}
            >
              <span className="text-[10px] font-semibold leading-none text-mut">{t.count > 0 ? t.count : ""}</span>
              <div
                className={`w-full max-w-8 rounded-t ${
                  t.count > 0 ? "bg-gradient-to-t from-cyan-500/40 to-cyan-300/80" : "bg-line-2/70"
                }`}
                style={{ height: t.count > 0 ? `${Math.max(12, (t.count / maxCount) * 100)}%` : "3px" }}
              />
              <span className="text-[9px] font-medium leading-none text-mut-2">
                {t.label.split(" ")[1]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent alerts with review workflow */}
      <div className="mt-4">
        <AlertsClient alerts={alerts} isAdmin />
      </div>
    </>
  );
}
