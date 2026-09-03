"use client";

// ---------------------------------------------------------------------------
// Recent alerts list with severity/status filters and the review workflow:
//   New → Investigating → Resolved  (administrator only).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, Spinner } from "./ui";
import { ALERT_STATUS_META, SEVERITY_META, timeAgo } from "@/lib/format";
import { IconBell, IconCheck, IconSearch } from "./icons";

export interface AlertRow {
  id: number;
  type: string;
  severity: string;
  title: string;
  message: string | null;
  username: string | null;
  ipAddress: string | null;
  resourceType: string | null;
  resourceId: string | null;
  status: string;
  createdAt: string;
}

export default function AlertsClient({ alerts, isAdmin }: { alerts: AlertRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return alerts.filter((a) => {
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        (a.message ?? "").toLowerCase().includes(q) ||
        (a.username ?? "").toLowerCase().includes(q) ||
        (a.ipAddress ?? "").toLowerCase().includes(q) ||
        a.type.toLowerCase().includes(q)
      );
    });
  }, [alerts, query, severityFilter, statusFilter]);

  async function setStatus(id: number, status: string) {
    setBusyId(id);
    try {
      await fetch("/api/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card overflow-hidden anim-rise-3">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3.5">
        <h2 className="mr-auto font-display text-sm font-semibold">
          Recent alerts <span className="text-mut-2">({filtered.length})</span>
        </h2>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mut-2" />
          <input
            className="input w-44 py-1.5 pl-8 text-xs"
            placeholder="Search alerts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-auto py-1.5 text-xs"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          aria-label="Filter by severity"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="input w-auto py-1.5 text-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<IconBell className="h-6 w-6" />}
          title="No alerts match"
          sub="Adjust the filters, or enjoy the quiet — no matching security alerts right now."
        />
      ) : (
        <div className="divide-y divide-line">
          {filtered.map((a) => {
            const severity = SEVERITY_META[a.severity] ?? { label: a.severity, tone: "slate" as const };
            const status = ALERT_STATUS_META[a.status] ?? { label: a.status, tone: "slate" as const };
            return (
              <div
                key={a.id}
                className={`flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-panel-2/40 ${
                  a.status === "new" ? "bg-rose-500/[0.03]" : ""
                }`}
              >
                <span
                  className={`mt-0.5 rounded-md border p-2 ${
                    a.status === "new"
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : a.status === "investigating"
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                        : "border-line-2 bg-field text-mut"
                  }`}
                >
                  <IconBell className="h-4 w-4" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{a.title}</p>
                    <Badge tone={severity.tone}>{severity.label}</Badge>
                    <Badge tone={status.tone} dot={a.status === "new"}>
                      {status.label}
                    </Badge>
                    {a.resourceType && (
                      <span className="rounded-md border border-line-2 bg-field px-2 py-0.5 font-mono text-[11px] text-mut">
                        {a.resourceType}
                        {a.resourceId ? ` #${a.resourceId}` : ""}
                      </span>
                    )}
                  </div>
                  {a.message && <p className="mt-1 text-[13px] leading-relaxed text-mut">{a.message}</p>}
                  <p className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-mut-2">
                    {a.type} · {timeAgo(a.createdAt)}
                    {a.username && <> · user “{a.username}”</>}
                    {a.ipAddress && <> · IP {a.ipAddress}</>}
                  </p>
                </div>

                {isAdmin && a.status !== "resolved" && (
                  <div className="flex shrink-0 gap-2">
                    {a.status === "new" && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setStatus(a.id, "investigating")}
                        disabled={busyId === a.id}
                      >
                        {busyId === a.id ? <Spinner className="h-3.5 w-3.5" /> : <IconSearch className="h-3.5 w-3.5" />}
                        Investigating
                      </button>
                    )}
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => setStatus(a.id, "resolved")}
                      disabled={busyId === a.id}
                    >
                      {busyId === a.id ? <Spinner className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-line px-5 py-2.5 text-xs text-mut-2">
        {alerts.length} alert{alerts.length === 1 ? "" : "s"} · rule-based prototype monitoring — thresholds in{" "}
        <span className="font-mono">src/lib/detection.ts</span>
        {!isAdmin && " · only administrators can update alert status"}
      </div>
    </div>
  );
}
