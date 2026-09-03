"use client";

// ---------------------------------------------------------------------------
// Audit Logs admin interface (client side):
//   - free-text search (user, detail, action, IP, user agent)
//   - user filter
//   - action filter (individual actions)
//   - date range filter (from / to)
//   - pagination (25 per page)
//
// Read-only by design: there is no control anywhere in this component that
// can modify or delete a log row — the records are append-only.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Badge, EmptyState } from "./ui";
import { ACTION_LABELS, formatDateTime } from "@/lib/format";
import { IconChevronRight, IconList, IconSearch, IconX } from "./icons";

export interface LogRow {
  id: number;
  username: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  detail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

const PAGE_SIZE = 25;

export default function AuditClient({ logs }: { logs: LogRow[] }) {
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  
  const users = useMemo(
    () =>
      [...new Set(logs.map((l) => l.username).filter((u): u is string => !!u))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [logs],
  );
  const actions = useMemo(
    () => [...new Set(logs.map((l) => l.action))].sort((a, b) => a.localeCompare(b)),
    [logs],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const from = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return logs.filter((l) => {
      if (userFilter !== "all" && l.username !== userFilter) return false;
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      const t = new Date(l.createdAt).getTime();
      if (from && t < from.getTime()) return false;
      if (to && t > to.getTime()) return false;
      if (!q) return true;
      return (
        (l.username ?? "").toLowerCase().includes(q) ||
        (l.detail ?? "").toLowerCase().includes(q) ||
        (ACTION_LABELS[l.action] ?? l.action).toLowerCase().includes(q) ||
        (l.resourceType ?? "").toLowerCase().includes(q) ||
        (l.ipAddress ?? "").toLowerCase().includes(q) ||
        (l.userAgent ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, query, userFilter, actionFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);
  const hasFilters =
    query !== "" || userFilter !== "all" || actionFilter !== "all" || dateFrom !== "" || dateTo !== "";

  function clearFilters() {
    setQuery("");
    setUserFilter("all");
    setActionFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <>
      {/* Filter toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 anim-rise-1">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mut-2" />
          <input
            className="input pl-9"
            placeholder="Search user, action, detail, IP or agent…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          aria-label="Filter by user"
        >
          <option value="all">All users</option>
          {users.map((u) => (
            <option key={u} value={u}>
              @{u}
            </option>
          ))}
        </select>
        <select
          className="input w-auto"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          aria-label="Filter by action"
        >
          <option value="all">All actions</option>
          {actions.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a] ?? a}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1.5 text-xs text-mut-2">
          <span>From</span>
          <input
            type="date"
            className="input w-auto py-1.5 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="From date"
          />
          <span>To</span>
          <input
            type="date"
            className="input w-auto py-1.5 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="To date"
          />
        </div>
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
            <IconX className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden anim-rise-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconList className="h-6 w-6" />}
            title="No matching log entries"
            sub="Try widening the date range, clearing the user or action filter, or a different search term."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead className="border-b border-line bg-panel-2/60">
                <tr>
                  <th className="th">Time</th>
                  <th className="th">User</th>
                  <th className="th">Action</th>
                  <th className="th">Resource</th>
                  <th className="th">Description</th>
                  <th className="th">IP</th>
                  <th className="th">User agent</th>
                  <th className="th">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-panel-2/40">
                    <td className="td whitespace-nowrap text-mut" title={formatDateTime(l.createdAt)}>
                      {formatDateTime(l.createdAt)}
                    </td>
                    <td className="td font-medium">{l.username ?? "—"}</td>
                    <td className={`td whitespace-nowrap font-semibold ${l.success ? "" : "text-rose-300"}`}>
                      {ACTION_LABELS[l.action] ?? l.action}
                    </td>
                    <td className="td text-xs text-mut-2">
                      {l.resourceType ? (
                        <span className="font-mono">
                          {l.resourceType}
                          {l.resourceId ? ` · #${l.resourceId}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td max-w-[280px]">
                      <p className="truncate text-mut" title={l.detail ?? ""}>
                        {l.detail ?? "—"}
                      </p>
                    </td>
                    <td className="td font-mono text-xs text-mut-2">{l.ipAddress ?? "—"}</td>
                    <td className="td max-w-[160px]">
                      <p className="truncate font-mono text-[11px] text-mut-2" title={l.userAgent ?? ""}>
                        {l.userAgent ?? "—"}
                      </p>
                    </td>
                    <td className="td">
                      <Badge tone={l.success ? "emerald" : "rose"}>
                        {l.success ? "OK" : "Failed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
          <p className="text-xs text-mut-2">
            Showing {rangeStart}–{rangeEnd} of {filtered.length} entries
            <span className="hidden sm:inline"> · latest 1000 retained in view · records are append-only</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost btn-sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <IconChevronRight className="h-3.5 w-3.5 rotate-180" /> Prev
            </button>
            <span className="text-xs font-semibold text-mut">
              Page {safePage} of {totalPages}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Next <IconChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
