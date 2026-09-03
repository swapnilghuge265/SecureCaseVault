"use client";

// ---------------------------------------------------------------------------
// Case management module (client side).
//
//  - Status strip: total + per-status counts (click a tile to filter)
//  - Search + case-type filter + status chips
//  - Case table: inline status/priority, edit, two-step delete
//  - CaseFormModal: shared create + edit form, incl. investigator assignment
//  - CaseEditButton: used on the case details page
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, EmptyState, Modal, Spinner } from "./ui";
import {
  CASE_CATEGORIES,
  CASE_STATUS_META,
  PRIORITY_META,
  formatDateTime,
  type Tone,
} from "@/lib/format";
import {
  IconChevronRight,
  IconFolder,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from "./icons";

export interface CaseRow {
  id: number;
  caseNumber: string;
  title: string;
  category: string;
  status: string;
  priority: string;
  ownerId: number;
  ownerName: string;
  docCount: number;
  updatedAt: string;
}

export interface InvestigatorOption {
  id: number;
  fullName: string;
}

const STATUS_FILTERS = ["all", "open", "investigating", "pending", "closed", "archived"] as const;

const STATUS_TILES: { key: string; label: string; tone: Tone }[] = [
  { key: "open", label: "Open", tone: "blue" },
  { key: "investigating", label: "Under Investigation", tone: "amber" },
  { key: "pending", label: "Pending", tone: "violet" },
  { key: "closed", label: "Closed", tone: "emerald" },
  { key: "archived", label: "Archived", tone: "slate" },
];

const DOT: Record<Tone, string> = {
  slate: "bg-slate-400",
  cyan: "bg-cyan-300",
  blue: "bg-sky-300",
  amber: "bg-amber-300",
  emerald: "bg-emerald-300",
  rose: "bg-rose-400",
  violet: "bg-violet-300",
};

export default function CasesClient({
  cases,
  investigators,
  canCreate,
  canUpdate,
  canDelete,
}: {
  cases: CaseRow[];
  investigators: InvestigatorOption[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CaseRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Per-status counts for the strip (computed from the visible rows).
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, investigating: 0, pending: 0, closed: 0, archived: 0 };
    for (const cse of cases) c[cse.status] = (c[cse.status] ?? 0) + 1;
    return c;
  }, [cases]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (typeFilter !== "all" && c.category !== typeFilter) return false;
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.caseNumber.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.ownerName.toLowerCase().includes(q)
      );
    });
  }, [cases, query, statusFilter, typeFilter]);

  // Update status or priority directly from the table.
  async function updateCase(id: number, field: "status" | "priority", value: string) {
    setBusyId(id);
    try {
      await fetch(`/api/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    setBusyId(id);
    try {
      await fetch(`/api/cases/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {/* Status strip — click a tile to filter the table by that status */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 anim-rise">
        <div className="card p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-mut-2">All Cases</p>
          <p className="mt-1 font-display text-xl font-semibold">{cases.length}</p>
        </div>
        {STATUS_TILES.map((t) => (
          <button
            key={t.key}
            onClick={() =>
              setStatusFilter(statusFilter === t.key ? "all" : (t.key as (typeof STATUS_FILTERS)[number]))
            }
            className={`card card-hover p-3.5 text-left ${statusFilter === t.key ? "border-cyan-400/60" : ""}`}
            title={`Filter by ${t.label}`}
          >
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-mut-2">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT[t.tone]}`} />
              {t.label}
            </p>
            <p className="mt-1 font-display text-xl font-semibold">{counts[t.key] ?? 0}</p>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 anim-rise-1">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mut-2" />
          <input
            className="input pl-9"
            placeholder="Search by title, number, type or investigator…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by case type"
        >
          <option value="all">All types</option>
          {CASE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === s
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-300"
                  : "border-line-2 text-mut hover:text-ink"
              }`}
            >
              {s === "all" ? "All" : (CASE_STATUS_META[s]?.label ?? s)}
            </button>
          ))}
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <IconPlus className="h-4 w-4" /> New case
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden anim-rise-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconFolder className="h-6 w-6" />}
            title={cases.length === 0 ? "No cases yet" : "No cases match your filters"}
            sub={
              cases.length === 0
                ? "Create the first case to start organizing documents."
                : "Try a different search term, type or status."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-line bg-panel-2/60">
                <tr>
                  <th className="th">Case</th>
                  <th className="th">Assigned Investigator</th>
                  <th className="th">Priority</th>
                  <th className="th">Status</th>
                  <th className="th">Docs</th>
                  <th className="th">Updated</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((c) => {
                  const status =
                    CASE_STATUS_META[c.status] ?? { label: c.status, tone: "slate" as const };
                  const priority =
                    PRIORITY_META[c.priority] ?? { label: c.priority, tone: "slate" as const };
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-panel-2/40">
                      <td className="td">
                        <Link href={`/cases/${c.id}`} className="group block">
                          <p className="font-mono text-xs text-cyan-300/90">{c.caseNumber}</p>
                          <p className="mt-0.5 max-w-[260px] truncate font-medium group-hover:text-cyan-200">
                            {c.title}
                          </p>
                        </Link>
                        <p className="mt-0.5 text-xs text-mut-2">{c.category}</p>
                      </td>
                      <td className="td text-mut">{c.ownerName}</td>
                      <td className="td">
                        {canUpdate && busyId !== c.id ? (
                          <select
                            className="input w-auto py-1.5 text-xs"
                            value={c.priority}
                            onChange={(e) => updateCase(c.id, "priority", e.target.value)}
                            aria-label={`Priority for ${c.caseNumber}`}
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        ) : (
                          <Badge tone={priority.tone}>{priority.label}</Badge>
                        )}
                      </td>
                      <td className="td">
                        {canUpdate && busyId !== c.id ? (
                          <select
                            className="input w-auto py-1.5 text-xs"
                            value={c.status}
                            onChange={(e) => updateCase(c.id, "status", e.target.value)}
                            aria-label={`Status for ${c.caseNumber}`}
                          >
                            <option value="open">Open</option>
                            <option value="investigating">Under Investigation</option>
                            <option value="pending">Pending</option>
                            <option value="closed">Closed</option>
                            <option value="archived">Archived</option>
                          </select>
                        ) : (
                          <Badge tone={status.tone} dot={c.status === "investigating"}>
                            {status.label}
                          </Badge>
                        )}
                      </td>
                      <td className="td text-mut">{c.docCount}</td>
                      <td className="td text-mut">{formatDateTime(c.updatedAt)}</td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1.5">
                          {canUpdate && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setEditing(c)}
                              title="Edit case"
                            >
                              <IconPencil className="h-3.5 w-3.5" /> Edit
                            </button>
                          )}
                          <Link href={`/cases/${c.id}`} className="btn btn-ghost btn-sm">
                            Open <IconChevronRight className="h-3.5 w-3.5" />
                          </Link>
                          {canDelete &&
                            (confirmDelete === c.id ? (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(c.id)}
                                disabled={busyId === c.id}
                              >
                                {busyId === c.id ? <Spinner className="h-3.5 w-3.5" /> : <IconX className="h-3.5 w-3.5" />}
                                Confirm
                              </button>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm hover:border-rose-500/40 hover:text-rose-300"
                                onClick={() => setConfirmDelete(c.id)}
                                title="Delete case"
                              >
                                <IconTrash className="h-3.5 w-3.5" />
                              </button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-4 py-2.5 text-xs text-mut-2">
          Showing {filtered.length} of {cases.length} cases
        </div>
      </div>

      {creating && (
        <CaseFormModal mode="create" investigators={investigators} onClose={() => setCreating(false)} />
      )}
      {editing && (
        <CaseFormModal mode="edit" initial={editing} investigators={investigators} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared create + edit form. In edit mode it also exposes status, and in
// both modes it assigns the case to an active investigator.
// ---------------------------------------------------------------------------

function CaseFormModal({
  mode,
  initial,
  investigators,
  onClose,
}: {
  mode: "create" | "edit";
  initial?: CaseRow & { description?: string | null };
  investigators: InvestigatorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [category, setCategory] = useState(initial?.category ?? CASE_CATEGORIES[0]);
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [status, setStatus] = useState(initial?.status ?? "open");
  const [ownerId, setOwnerId] = useState(initial ? String(initial.ownerId) : "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If the current assignee isn't an investigator (legacy data), keep them
  // selectable so nothing gets clobbered by the edit form.
  const options = useMemo(() => {
    const list = [...investigators];
    if (initial && !list.some((o) => o.id === initial.ownerId)) {
      list.push({ id: initial.ownerId, fullName: `${initial.ownerName} (current)` });
    }
    return list;
  }, [investigators, initial]);

  async function submit() {
    if (!title.trim()) return setError("Please enter a case title.");
    if (!ownerId) return setError("Please choose an assigned investigator.");
    setError("");
    setLoading(true);
    try {
      if (mode === "create") {
        const res = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            category,
            priority,
            ownerId: Number(ownerId),
            description: description.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "The case could not be created.");
          return;
        }
      } else {
        const res = await fetch(`/api/cases/${initial!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim(),
            category,
            priority,
            status,
            ownerId: Number(ownerId),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "The case could not be saved.");
          return;
        }
      }
      onClose();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title={mode === "create" ? "Create new case" : `Edit ${initial?.caseNumber}`} onClose={onClose}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
            {error}
          </div>
        )}
        <div>
          <span className="label">Case title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cloud credentials misuse" />
        </div>
        <div>
          <span className="label">Description</span>
          <textarea
            className="input min-h-20 resize-y"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief summary of the investigation…"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <span className="label">Case type</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CASE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">Priority</span>
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <span className="label">Assigned investigator</span>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Select…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
        {mode === "edit" && (
          <div>
            <span className="label">Status</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="open">Open</option>
              <option value="investigating">Under Investigation</option>
              <option value="pending">Pending</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <Spinner /> : <IconPlus className="h-4 w-4" />}
            {loading ? "Saving…" : mode === "create" ? "Create case" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Small wrapper for the case details page: holds the modal open/closed state.
// ---------------------------------------------------------------------------

export function CaseEditButton({
  initial,
  investigators,
}: {
  initial: CaseRow & { description: string };
  investigators: InvestigatorOption[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn btn-ghost" onClick={() => setOpen(true)}>
        <IconPencil className="h-4 w-4" /> Edit case
      </button>
      {open && (
        <CaseFormModal mode="edit" initial={initial} investigators={investigators} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
