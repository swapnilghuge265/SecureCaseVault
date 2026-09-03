"use client";

// ---------------------------------------------------------------------------
// Documents page (client side): search & filters, upload modal, preview
// modal, download links and two-step delete. Data arrives pre-loaded from
// the server component; mutations call the API then router.refresh().
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Badge, EmptyState, Modal, Spinner } from "./ui";
import { SECURITY_META, formatBytes, formatDateTime } from "@/lib/format";
import {
  IconChevronRight,
  IconDownload,
  IconEye,
  IconFileText,
  IconSearch,
  IconTrash,
  IconUpload,
  IconUsers,
  IconX,
} from "./icons";

export interface DocRow {
  id: number;
  caseId: number;
  caseNumber: string;
  caseTitle: string;
  name: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  securityLevel: string;
  description: string | null;
  uploader: string;
  uploaderId: number;
  /** Who this document is explicitly shared with (see lib/visibility). */
  shares: { id: number; name: string }[];
  createdAt: string;
}

function fileExt(name: string): string {
  return (name.split(".").pop() ?? "").toUpperCase();
}

export interface CaseOption {
  id: number;
  caseNumber: string;
  title: string;
}

export interface UserOption {
  id: number;
  username: string;
  fullName: string;
}

const MIMES_WITH_TEXT_PREVIEW = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/x-markdown",
  "application/json",
  "text/xml",
  "application/xml",
  "text/html",
  "text/x-log",
];

export default function DocumentsClient({
  docs,
  cases,
  users,
  canUpload,
  canDelete,
  canShare,
}: {
  docs: DocRow[];
  cases: CaseOption[];
  users: UserOption[];
  canUpload: boolean;
  canDelete: boolean;
  canShare: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [caseFilter, setCaseFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [preview, setPreview] = useState<DocRow | null>(null);
  const [shareDocId, setShareDocId] = useState<number | null>(null);

  // Two-step delete: id of the row currently asking for confirmation.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (caseFilter !== "all" && d.caseId !== Number(caseFilter)) return false;
      if (levelFilter !== "all" && d.securityLevel !== levelFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        d.caseNumber.toLowerCase().includes(q) ||
        d.caseTitle.toLowerCase().includes(q) ||
        d.uploader.toLowerCase().includes(q)
      );
    });
  }, [docs, query, caseFilter, levelFilter]);

  async function handleDelete(id: number) {
    setBusy(true);
    try {
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      setConfirmDelete(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5 anim-rise-1">
        <div className="relative min-w-[220px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mut-2" />
          <input
            className="input pl-9"
            placeholder="Search by name, case, description or uploader…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={caseFilter} onChange={(e) => setCaseFilter(e.target.value)} aria-label="Filter by case">
          <option value="all">All cases</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caseNumber}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} aria-label="Filter by security level">
          <option value="all">All levels</option>
          <option value="confidential">Confidential</option>
          <option value="secret">Secret</option>
          <option value="top_secret">Top Secret</option>
        </select>
        {canUpload && (
          <button className="btn btn-primary" onClick={() => setUploadOpen(true)}>
            <IconUpload className="h-4 w-4" /> Upload
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden anim-rise-2">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconFileText className="h-6 w-6" />}
            title={docs.length === 0 ? "No documents yet" : "No documents match your filters"}
            sub={
              docs.length === 0
                ? "Upload the first document to start building the case vault."
                : "Try adjusting the search text or clearing the filters."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead className="border-b border-line bg-panel-2/60">
                <tr>
                  <th className="th">Document</th>
                  <th className="th">Case</th>
                  <th className="th">Type</th>
                  <th className="th">Security</th>
                  <th className="th">Size</th>
                  <th className="th">Uploaded by</th>
                  <th className="th">Date</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((d) => {
                  const level = SECURITY_META[d.securityLevel] ?? { label: d.securityLevel, tone: "slate" as const };
                  return (
                    <tr key={d.id} className="transition-colors hover:bg-panel-2/40">
                      <td className="td">
                        <div className="flex items-center gap-3">
                          <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
                            <IconFileText className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[280px] truncate font-medium" title={d.name}>
                              {d.name}
                            </p>
                            <p className="max-w-[280px] truncate text-xs text-mut-2">
                              {d.description ??
                                (d.originalName !== d.name ? (
                                  <span title={d.originalName}>as: {d.originalName}</span>
                                ) : d.shares.length > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-cyan-300/90">
                                    <IconUsers className="h-3 w-3" />
                                    Shared with {d.shares.length} user{d.shares.length > 1 ? "s" : ""}
                                  </span>
                                ) : null)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="td">
                        <p className="font-mono text-xs text-cyan-300/90">{d.caseNumber}</p>
                        <p className="max-w-[160px] truncate text-xs text-mut">{d.caseTitle}</p>
                      </td>
                      <td className="td">
                        <Badge tone="slate">{fileExt(d.name)}</Badge>
                      </td>
                      <td className="td">
                        <Badge tone={level.tone}>{level.label}</Badge>
                      </td>
                      <td className="td text-mut">{formatBytes(d.sizeBytes)}</td>
                      <td className="td text-mut">{d.uploader}</td>
                      <td className="td text-mut">{formatDateTime(d.createdAt)}</td>
                      <td className="td">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setPreview(d)}
                            title="Preview"
                          >
                            <IconEye className="h-3.5 w-3.5" /> View
                          </button>
                          <a
                            className="btn btn-ghost btn-sm"
                            href={`/api/documents/${d.id}/download`}
                            title="Download"
                          >
                            <IconDownload className="h-3.5 w-3.5" />
                          </a>
                          <Link href={`/documents/${d.id}`} className="btn btn-ghost btn-sm" title="Document details">
                            Details <IconChevronRight className="h-3.5 w-3.5" />
                          </Link>
                          {canShare && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setShareDocId(d.id)}
                              title="Share with a user"
                            >
                              <IconUsers className="h-3.5 w-3.5" /> Share
                            </button>
                          )}
                          {canDelete &&
                            (confirmDelete === d.id ? (
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => handleDelete(d.id)}
                                disabled={busy}
                              >
                                {busy ? <Spinner className="h-3.5 w-3.5" /> : <IconX className="h-3.5 w-3.5" />}
                                Confirm
                              </button>
                            ) : (
                              <button
                                className="btn btn-ghost btn-sm hover:border-rose-500/40 hover:text-rose-300"
                                onClick={() => setConfirmDelete(d.id)}
                                title="Delete"
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
          Showing {filtered.length} of {docs.length} documents
        </div>
      </div>

      <UploadModal
        open={uploadOpen}
        cases={cases}
        onClose={() => setUploadOpen(false)}
      />
      <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      <ShareModal
        docId={shareDocId}
        docs={docs}
        users={users}
        onClose={() => setShareDocId(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// ShareModal — explicit per-user access grants. Sharing is how a Viewer
// (or any role) gets access to a document outside their assigned cases;
// every grant/revocation is audited server-side.
// ---------------------------------------------------------------------------

function ShareModal({
  docId,
  docs,
  users,
  onClose,
}: {
  docId: number | null;
  docs: DocRow[];
  users: UserOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [busyUser, setBusyUser] = useState<number | null>(null);
  const [error, setError] = useState("");

  // Read the doc from live props so the share list updates after
  // router.refresh() re-renders the parent.
  const doc = docs.find((d) => d.id === docId) ?? null;
  if (!doc) return null;

  async function toggle(userId: number, shared: boolean) {
    setBusyUser(userId);
    setError("");
    try {
      const res = await fetch(`/api/documents/${doc!.id}/shares`, {
        method: shared ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "The action could not be completed.");
      router.refresh();
    } finally {
      setBusyUser(null);
    }
  }

  return (
    <Modal open={!!doc} title={`Share ${doc.name}`} onClose={onClose}>
      <p className="mb-4 text-xs leading-relaxed text-mut-2">
        Sharing explicitly grants a user access to this single document. Viewer-role users can only
        see documents shared with them, and every change is written to the audit log.
      </p>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      <ul className="divide-y divide-line">
        {users.map((u) => {
          const share = doc.shares.find((s) => s.id === u.id);
          const isUploader = u.id === doc.uploaderId;
          return (
            <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={u.fullName} size="h-8 w-8" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{u.fullName}</p>
                  <p className="truncate text-xs text-mut-2">@{u.username}</p>
                </div>
              </div>
              {isUploader ? (
                <Badge tone="cyan">Uploader</Badge>
              ) : share ? (
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busyUser === u.id}
                  onClick={() => toggle(u.id, true)}
                >
                  {busyUser === u.id ? <Spinner className="h-3.5 w-3.5" /> : <IconX className="h-3.5 w-3.5" />}
                  Remove
                </button>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busyUser === u.id}
                  onClick={() => toggle(u.id, false)}
                >
                  {busyUser === u.id ? <Spinner className="h-3.5 w-3.5" /> : <IconUsers className="h-3.5 w-3.5" />}
                  Share
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function UploadModal({
  open,
  cases,
  onClose,
}: {
  open: boolean;
  cases: CaseOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caseId, setCaseId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("confidential");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function reset() {
    setCaseId("");
    setName("");
    setDescription("");
    setLevel("confidential");
    setFile(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (!caseId) return setError("Please select a case.");
    if (!file) return setError("Please choose a file to upload.");
    setError("");
    setLoading(true);
    try {
      const body = new FormData();
      body.set("caseId", caseId);
      body.set("name", name.trim() || file.name);
      body.set("description", description.trim());
      body.set("securityLevel", level);
      body.set("file", file);
      const res = await fetch("/api/documents", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      reset();
      onClose();
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="Upload document" onClose={() => { reset(); onClose(); }}>
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div>
          <span className="label">File</span>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed border-line-2 bg-field px-4 py-3.5 text-sm transition-colors hover:border-cyan-400/50">
            <span className={file ? "font-medium" : "text-mut-2"}>
              {file ? file.name : "Click to choose a file…"}
            </span>
            {file && <span className="text-xs text-mut-2">{formatBytes(file.size)}</span>}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name);
              }}
            />
          </label>
          <p className="mt-1.5 text-[11px] text-mut-2">
            Supported formats: PDF, DOCX, XLSX, JPG, PNG, TXT — max 10 MB. A SHA-256
            integrity hash is recorded when the file is stored.
          </p>
        </div>

        <div>
          <span className="label">Case</span>
          <select className="input" value={caseId} onChange={(e) => setCaseId(e.target.value)}>
            <option value="">Select a case…</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber} — {c.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="label">Display name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Defaults to the file name"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="label">Security level</span>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="confidential">Confidential</option>
              <option value="secret">Secret</option>
              <option value="top_secret">Top Secret</option>
            </select>
          </div>
          <div>
            <span className="label">Description (optional)</span>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn btn-ghost" onClick={() => { reset(); onClose(); }}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <Spinner /> : <IconUpload className="h-4 w-4" />}
            {loading ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

interface PreviewState {
  url: string | null;
  text: string | null;
  loading: boolean;
  error: string;
}

function PreviewModal({ doc, onClose }: { doc: DocRow | null; onClose: () => void }) {
  const [state, setState] = useState<PreviewState>({
    url: null,
    text: null,
    loading: false,
    error: "",
  });
  const urlRef = useRef<string | null>(null);
  const docId = doc?.id ?? null;

  // Fetch the file as a blob whenever a new document is opened.
  useEffect(() => {
  let cancelled = false;
  urlRef.current = null;

  fetch(`/api/documents/${docId}/preview`)
      .then(async (res) => {
        if (!res.ok) throw new Error("unavailable");
        const blob = await res.blob();
        if (blob.type === "application/pdf" || blob.type.startsWith("image/")) {
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          if (!cancelled) setState({ url, text: null, loading: false, error: "" });
        } else if (
          MIMES_WITH_TEXT_PREVIEW.includes(blob.type) ||
          blob.type === "application/octet-stream"
        ) {
          const t = await blob.text();
          if (!cancelled)
            setState({
              url: null,
              text: t.length > 20000 ? t.slice(0, 20000) + "\n… (truncated)" : t,
              loading: false,
              error: "",
            });
        } else {
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          if (!cancelled) setState({ url, text: null, loading: false, error: "" });
        }
      })
      .catch(() => {
        if (!cancelled)
          setState({
            url: null,
            text: null,
            loading: false,
            error: "This file type cannot be previewed in the browser. Use download instead.",
          });
      });

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [docId]);

  if (!doc) return null;

  return (
    <Modal open={!!doc} wide title={doc.name} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-mut-2">
        <Badge tone={(SECURITY_META[doc.securityLevel] ?? { tone: "slate" }).tone}>
          {(SECURITY_META[doc.securityLevel] ?? { label: doc.securityLevel }).label}
        </Badge>
        <span>{doc.caseNumber}</span>
        <span>·</span>
        <span>{formatBytes(doc.sizeBytes)}</span>
        <span>·</span>
        <span>{formatDateTime(doc.createdAt)}</span>
        <a
          href={`/api/documents/${doc.id}/download`}
          className="ml-auto inline-flex items-center gap-1.5 font-semibold text-cyan-300 hover:text-cyan-200"
        >
          <IconDownload className="h-3.5 w-3.5" /> Download
        </a>
      </div>

      {state.loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-mut">
          <Spinner /> Loading preview…
        </div>
      )}
      {!state.loading && state.error && (
        <p className="py-10 text-center text-sm text-mut">{state.error}</p>
      )}
      {!state.loading && !state.error && state.text !== null && (
        <pre className="max-h-[55vh] overflow-auto rounded-lg border border-line bg-[#060d1a] p-4 font-mono text-xs leading-relaxed text-slate-300">
          {state.text}
        </pre>
      )}
      {!state.loading && !state.error && state.url && (
        doc.mimeType === "application/pdf" ? (
          <iframe title={doc.name} src={state.url} className="h-[62vh] w-full rounded-lg border border-line bg-white" />
        ) : doc.mimeType.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.url} alt={doc.name} className="mx-auto max-h-[55vh] rounded-lg border border-line" />
        ) : (
          <a href={state.url} download={doc.name} className="btn btn-primary mx-auto flex">
            <IconDownload className="h-4 w-4" /> Save file
          </a>
        )
      )}
    </Modal>
  );
}
