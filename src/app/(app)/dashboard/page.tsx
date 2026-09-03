// Dashboard — role-aware overview.
//
// Visibility: every number and list respects the rules in
// src/lib/visibility.ts, so a viewer never sees titles of files they
// cannot open, and an investigator only counts their assigned work.
// Admins see the full picture plus the open-alerts queue.

import type { Metadata } from "next";

import Link from "next/link";

import { and, count, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";

import {
  auditLogs,
  cases,
  documentAnalyses,
  documentShares,
  documents,
  securityAlerts,
  users,
} from "@/db/schema";

import { can, requireUser } from "@/lib/auth";

import { visibleCaseIds, visibleDocumentIds } from "@/lib/visibility";

import {
  ACTION_LABELS,
  SECURITY_META,
  SEVERITY_META,
  formatBytes,
  startOfToday,
  timeAgo,
} from "@/lib/format";

import { Badge, PageHeader, StatCard } from "@/components/ui";

import {
  IconBell,
  IconFileText,
  IconFolder,
  IconKey,
  IconUpload,
  IconUser,
  IconUsers,
} from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard" };

const ACTIVITY_ICONS: Array<
  [RegExp, React.ComponentType<{ className?: string }>]
> = [
  [/^login/, IconKey],
  [/^case/, IconFolder],
  [/^document/, IconFileText],
  [/^alert/, IconBell],
  [/^user/, IconUser],
];

export default async function DashboardPage() {
  const { user } = await requireUser();

  const isAdmin = can(user.role, "manageAlerts");

  const today = startOfToday();

  // Resolve this user's visibility once, reuse it for every query.
  const caseVis = await visibleCaseIds(user);
  const docVis = await visibleDocumentIds(user);

  // ------------------------------------------------------------
  // KPI COUNTS
  // ------------------------------------------------------------

  const countCases = async () => {
    if (caseVis.all) {
      const [r] = await db.select({ n: count() }).from(cases);

      return Number(r?.n ?? 0);
    }

    if (caseVis.ids.length === 0) {
      return 0;
    }

    const [r] = await db
      .select({ n: count() })
      .from(cases)
      .where(inArray(cases.id, caseVis.ids));

    return Number(r?.n ?? 0);
  };

  const countDocs = async (since?: Date) => {
    if (docVis.all) {
      const [r] = await db
        .select({ n: count() })
        .from(documents)
        .where(since ? gte(documents.createdAt, since) : undefined);

      return Number(r?.n ?? 0);
    }

    if (docVis.ids.length === 0) {
      return 0;
    }

    const [r] = await db
      .select({ n: count() })
      .from(documents)
      .where(
        and(
          inArray(documents.id, docVis.ids),
          since ? gte(documents.createdAt, since) : undefined,
        ),
      );

    return Number(r?.n ?? 0);
  };

  const [totalCases, totalDocs, docsToday, sharedRows, alertRows] =
    await Promise.all([
      countCases(),
      countDocs(),
      countDocs(today),

      db
        .select({ n: count() })
        .from(documentShares)
        .where(eq(documentShares.userId, user.id)),

      db
        .select({ n: count() })
        .from(securityAlerts)
        .where(eq(securityAlerts.status, "new")),
    ]);

  const sharedCount = Number(sharedRows[0]?.n ?? 0);

  const openAlerts = Number(alertRows[0]?.n ?? 0);

  // ------------------------------------------------------------
  // AI SECURITY INTELLIGENCE
  // ------------------------------------------------------------
  // Only analyze documents visible to the current user.

  const [aiAnalysisRows, riskRows, threatRows] = await Promise.all([
    // Total completed AI analyses
    docVis.all
      ? db
          .select({ n: count() })
          .from(documentAnalyses)
          .where(eq(documentAnalyses.status, "completed"))
      : docVis.ids.length === 0
        ? Promise.resolve([{ n: 0 }])
        : db
            .select({ n: count() })
            .from(documentAnalyses)
            .where(
              and(
                inArray(documentAnalyses.documentId, docVis.ids),
                eq(documentAnalyses.status, "completed"),
              ),
            ),

    // Risk-level distribution
    docVis.all
      ? db
          .select({
            riskLevel: documentAnalyses.riskLevel,
            n: count(),
          })
          .from(documentAnalyses)
          .where(eq(documentAnalyses.status, "completed"))
          .groupBy(documentAnalyses.riskLevel)
      : docVis.ids.length === 0
        ? Promise.resolve([])
        : db
            .select({
              riskLevel: documentAnalyses.riskLevel,
              n: count(),
            })
            .from(documentAnalyses)
            .where(
              and(
                inArray(documentAnalyses.documentId, docVis.ids),
                eq(documentAnalyses.status, "completed"),
              ),
            )
            .groupBy(documentAnalyses.riskLevel),

    // Individual detected threats.
    // We intentionally do NOT group by the array because
    // detectedThreats contains multiple threat indicators.
    docVis.all
      ? db
          .select({
            detectedThreats: documentAnalyses.detectedThreats,
          })
          .from(documentAnalyses)
          .where(eq(documentAnalyses.status, "completed"))
      : docVis.ids.length === 0
        ? Promise.resolve([])
        : db
            .select({
              detectedThreats: documentAnalyses.detectedThreats,
            })
            .from(documentAnalyses)
            .where(
              and(
                inArray(documentAnalyses.documentId, docVis.ids),
                eq(documentAnalyses.status, "completed"),
              ),
            ),
  ]);

  // ------------------------------------------------------------
  // AI ANALYSIS COUNTS
  // ------------------------------------------------------------

  const aiAnalyses = Number(aiAnalysisRows[0]?.n ?? 0);

  const riskCounts = {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };

  for (const row of riskRows) {
    const level =
      row.riskLevel?.toUpperCase() as keyof typeof riskCounts;

    if (level in riskCounts) {
      riskCounts[level] = Number(row.n ?? 0);
    }
  }

  // ------------------------------------------------------------
  // THREAT ANALYTICS
  // ------------------------------------------------------------
  // Each document analysis may contain multiple threats.
  // Example:
  //
  // [
  //   "Credential Abuse / Account Compromise",
  //   "Possible Data Exfiltration",
  //   "Authentication Security Event"
  // ]
  //
  // We count each threat separately.

  const threatMap = new Map<string, number>();

  for (const row of threatRows) {
    for (const threat of row.detectedThreats ?? []) {
      const name = threat.trim();

      if (!name) {
        continue;
      }

      threatMap.set(name, (threatMap.get(name) ?? 0) + 1);
    }
  }

  const threatCounts = Array.from(threatMap.entries())
    .map(([type, threatCount]) => ({
      type,
      count: threatCount,
    }))
    .sort((a, b) => b.count - a.count);

  // ------------------------------------------------------------
  // ACTIVITY FEED
  // ------------------------------------------------------------
  // Admins see everything; everyone else sees their own actions.

  const activity = await db
    .select()
    .from(auditLogs)
    .where(
      isAdmin ? undefined : eq(auditLogs.username, user.username),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(8);

  // ------------------------------------------------------------
  // RECENT DOCUMENTS
  // ------------------------------------------------------------

  const recentDocs = await db
    .select()
    .from(documents)
    .where(
      docVis.all ? undefined : inArray(documents.id, docVis.ids),
    )
    .orderBy(desc(documents.createdAt))
    .limit(5);

  // ------------------------------------------------------------
  // RIGHT-HAND PANEL
  // ------------------------------------------------------------

  const latestAlerts = isAdmin
    ? await db
        .select()
        .from(securityAlerts)
        .where(eq(securityAlerts.status, "new"))
        .orderBy(desc(securityAlerts.createdAt))
        .limit(4)
    : [];

  const sharedDocs = isAdmin
    ? []
    : await db
        .select({
          doc: documents,
          sharedAt: documentShares.createdAt,
        })
        .from(documentShares)
        .innerJoin(
          documents,
          eq(documentShares.documentId, documents.id),
        )
        .where(eq(documentShares.userId, user.id))
        .orderBy(desc(documentShares.createdAt))
        .limit(4);

  // ------------------------------------------------------------
  // CASE / USER LOOKUPS
  // ------------------------------------------------------------

  const caseMap = new Map(
    (
      await db
        .select({
          id: cases.id,
          caseNumber: cases.caseNumber,
        })
        .from(cases)
    ).map((c) => [c.id, c.caseNumber]),
  );

  const userMap = new Map(
    (
      await db
        .select({
          id: users.id,
          fullName: users.fullName,
        })
        .from(users)
    ).map((u) => [u.id, u.fullName]),
  );

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ------------------------------------------------------------
  // UI
  // ------------------------------------------------------------

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.fullName.split(" ")[0]}`}
        sub={`Operations overview — ${todayLabel}`}
      >
        {can(user.role, "upload") && (
          <Link
            href="/documents"
            className="btn btn-primary"
          >
            <IconUpload className="h-4 w-4" />
            Upload document
          </Link>
        )}
      </PageHeader>

      {/* KPI cards */}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isAdmin ? "Total Cases" : "Assigned Cases"}
          value={totalCases}
          sub={
            isAdmin
              ? "Across all categories"
              : "Owned or created by you"
          }
          tone="cyan"
          icon={<IconFolder className="h-5 w-5" />}
          delay="anim-rise-1"
        />

        <StatCard
          label="Visible Documents"
          value={totalDocs}
          sub="Within your access level"
          tone="blue"
          icon={<IconFileText className="h-5 w-5" />}
          delay="anim-rise-2"
        />

        <StatCard
          label="Uploaded Today"
          value={docsToday}
          sub="New files since midnight"
          tone="emerald"
          icon={<IconUpload className="h-5 w-5" />}
          delay="anim-rise-3"
        />

        {isAdmin ? (
          <StatCard
            label="Open Alerts"
            value={openAlerts}
            sub="Awaiting administrator review"
            tone="rose"
            icon={<IconBell className="h-5 w-5" />}
            delay="anim-rise-3"
          />
        ) : (
          <StatCard
            label="Shared With Me"
            value={sharedCount}
            sub="Documents explicitly shared"
            tone="violet"
            icon={<IconUsers className="h-5 w-5" />}
            delay="anim-rise-3"
          />
        )}
      </div>

      {/* Security Intelligence */}

      <div className="mt-4 card anim-rise-2">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-display text-sm font-semibold">
              Security Intelligence
            </h2>

            <p className="mt-1 text-[11px] text-mut-2">
              AI-powered document risk analysis
            </p>
          </div>

          <Link
            href="/documents"
            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
          >
            View documents →
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-5">
          <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              AI Analyses
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-violet-300">
              {aiAnalyses}
            </p>

            <p className="mt-1 text-[11px] text-mut-2">
              Completed analyses
            </p>
          </div>

          <div className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Critical
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-rose-300">
              {riskCounts.CRITICAL}
            </p>

            <p className="mt-1 text-[11px] text-mut-2">
              Immediate review
            </p>
          </div>

          <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              High Risk
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-amber-300">
              {riskCounts.HIGH}
            </p>

            <p className="mt-1 text-[11px] text-mut-2">
              Requires attention
            </p>
          </div>

          <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Medium
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-violet-300">
              {riskCounts.MEDIUM}
            </p>

            <p className="mt-1 text-[11px] text-mut-2">
              Monitor
            </p>
          </div>

          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">
              Low Risk
            </p>

            <p className="mt-2 font-display text-2xl font-semibold text-emerald-300">
              {riskCounts.LOW}
            </p>

            <p className="mt-1 text-[11px] text-mut-2">
              Normal
            </p>
          </div>
        </div>

        {threatCounts.length > 0 && (
          <div className="border-t border-line px-5 py-4">
            <div className="mb-3">
              <h3 className="text-xs font-semibold">
                Detected Threat Types
              </h3>

              <p className="mt-1 text-[11px] text-mut-2">
                Security indicators identified by document analysis
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              {threatCounts.slice(0, 6).map((threat) => (
                <div
                  key={threat.type}
                  className="flex items-center justify-between rounded-lg border border-line-2 bg-field px-3 py-2.5"
                >
                  <span className="truncate text-xs text-mut">
                    {threat.type}
                  </span>

                  <span className="ml-3 shrink-0 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 font-mono text-[11px] font-semibold text-cyan-300">
                    {threat.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Activity + alerts / shared */}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div
          className={`card anim-rise-2 ${
            isAdmin ? "lg:col-span-2" : "lg:col-span-2"
          }`}
        >
          <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <h2 className="font-display text-sm font-semibold">
              {isAdmin
                ? "Recent Activity"
                : "Your Recent Activity"}
            </h2>

            {isAdmin && (
              <Link
                href="/audit"
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                View all logs →
              </Link>
            )}
          </div>

          {activity.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-mut-2">
              No activity recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => {
                const Icon =
                  ACTIVITY_ICONS.find(([re]) =>
                    re.test(a.action),
                  )?.[1] ?? IconUser;

                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-panel-2/40"
                  >
                    <span className="rounded-md border border-line-2 bg-field p-2 text-mut">
                      <Icon className="h-3.5 w-3.5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        <span className="font-semibold">
                          {a.username ?? "System"}
                        </span>{" "}
                        <span
                          className={
                            a.success
                              ? "text-mut"
                              : "text-rose-300"
                          }
                        >
                          {(
                            ACTION_LABELS[a.action] ?? a.action
                          ).toLowerCase()}
                        </span>

                        {a.success === false && (
                          <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-rose-300">
                            failed
                          </span>
                        )}
                      </p>

                      {a.detail && (
                        <p className="truncate text-xs text-mut-2">
                          {a.detail}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 text-[11px] font-medium text-mut-2">
                      {timeAgo(a.createdAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {isAdmin ? (
          <div className="card anim-rise-3">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold">
                Security Alerts
              </h2>

              <Link
                href="/alerts"
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                All alerts →
              </Link>
            </div>

            {latestAlerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                <IconBell className="h-5 w-5 text-mut-2" />

                <p className="text-sm text-mut">
                  No open alerts
                </p>

                <p className="text-xs text-mut-2">
                  The vault looks quiet right now.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {latestAlerts.map((a) => {
                  const sev =
                    SEVERITY_META[a.severity] ?? {
                      label: a.severity,
                      tone: "slate" as const,
                    };

                  return (
                    <li key={a.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {a.title}
                        </p>

                        <Badge tone={sev.tone}>
                          {sev.label}
                        </Badge>
                      </div>

                      {a.message && (
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-mut">
                          {a.message}
                        </p>
                      )}

                      <p className="mt-1.5 text-[11px] font-medium text-mut-2">
                        {timeAgo(a.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="card anim-rise-3">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold">
                Shared With Me
              </h2>

              <Link
                href="/documents"
                className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                All documents →
              </Link>
            </div>

            {sharedDocs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                <IconUsers className="h-5 w-5 text-mut-2" />

                <p className="text-sm text-mut">
                  Nothing shared yet
                </p>

                <p className="text-xs leading-relaxed text-mut-2">
                  When an investigator or administrator shares a
                  case file with you, it appears here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {sharedDocs.map(({ doc, sharedAt }) => {
                  const level =
                    SECURITY_META[doc.securityLevel] ?? {
                      label: doc.securityLevel,
                      tone: "slate" as const,
                    };

                  return (
                    <li
                      key={doc.id}
                      className="px-5 py-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {doc.name}
                        </p>

                        <Badge tone={level.tone}>
                          {level.label}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs text-mut-2">
                        {caseMap.get(doc.caseId) ?? "—"} · shared{" "}
                        {timeAgo(sharedAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Recent documents */}

      <div className="card mt-4 overflow-hidden anim-rise-3">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-sm font-semibold">
            Recent Documents
          </h2>

          <Link
            href="/documents"
            className="text-xs font-semibold text-cyan-300 hover:text-cyan-200"
          >
            All documents →
          </Link>
        </div>

        {recentDocs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-mut-2">
            No documents within your access level yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-line bg-panel-2/60">
                <tr>
                  <th className="th">Document</th>
                  <th className="th">Case</th>
                  <th className="th">Security</th>
                  <th className="th">Size</th>
                  <th className="th">Uploaded</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-line">
                {recentDocs.map((d) => {
                  const level =
                    SECURITY_META[d.securityLevel] ?? {
                      label: d.securityLevel,
                      tone: "slate" as const,
                    };

                  return (
                    <tr
                      key={d.id}
                      className="transition-colors hover:bg-panel-2/40"
                    >
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
                            <IconFileText className="h-4 w-4" />
                          </span>

                          <span className="max-w-[260px] truncate font-medium">
                            {d.name}
                          </span>
                        </div>
                      </td>

                      <td className="td font-mono text-xs text-cyan-300/90">
                        {caseMap.get(d.caseId) ?? "—"}
                      </td>

                      <td className="td">
                        <Badge tone={level.tone}>
                          {level.label}
                        </Badge>
                      </td>

                      <td className="td text-mut">
                        {formatBytes(d.sizeBytes)}
                      </td>

                      <td className="td text-mut">
                        {userMap.get(d.uploadedBy ?? -1) ?? "—"} ·{" "}
                        {timeAgo(d.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
