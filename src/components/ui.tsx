"use client";

// ---------------------------------------------------------------------------
// Small reusable UI building blocks: Badge, StatCard, Modal, EmptyState,
// PageHeader, Spinner, Avatar.
// ---------------------------------------------------------------------------

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { initials, type Tone } from "@/lib/format";
import { IconAlert, IconX } from "./icons";

const TONES: Record<Tone, string> = {
  slate: "bg-slate-400/10 text-slate-300 border-slate-400/25",
  cyan: "bg-cyan-400/10 text-cyan-300 border-cyan-400/30",
  blue: "bg-sky-400/10 text-sky-300 border-sky-400/30",
  amber: "bg-amber-400/10 text-amber-300 border-amber-400/30",
  emerald: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
  rose: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  violet: "bg-violet-400/10 text-violet-300 border-violet-400/30",
};

export function Badge({
  tone = "slate",
  dot,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${TONES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current pulse-dot" />}
      {children}
    </span>
  );
}

const STAT_TONES: Record<Tone, { icon: string; ring: string }> = {
  cyan: { icon: "bg-cyan-400/10 text-cyan-300 border-cyan-400/25", ring: "" },
  blue: { icon: "bg-sky-400/10 text-sky-300 border-sky-400/25", ring: "" },
  emerald: { icon: "bg-emerald-400/10 text-emerald-300 border-emerald-400/25", ring: "" },
  rose: { icon: "bg-rose-500/10 text-rose-300 border-rose-500/25", ring: "" },
  amber: { icon: "bg-amber-400/10 text-amber-300 border-amber-400/25", ring: "" },
  violet: { icon: "bg-violet-400/10 text-violet-300 border-violet-400/25", ring: "" },
  slate: { icon: "bg-slate-400/10 text-slate-300 border-slate-400/25", ring: "" },
};

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "cyan",
  delay,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  tone?: Tone;
  delay?: string;
}) {
  const t = STAT_TONES[tone];
  return (
    <div className={`card card-hover p-5 ${delay ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-mut-2">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight">{value}</p>
          {sub && <p className="mt-1 truncate text-xs text-mut">{sub}</p>}
        </div>
        <div className={`shrink-0 rounded-lg border p-2.5 ${t.icon}`}>{icon}</div>
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  // Close on Escape for convenience.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-[#02060d]/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`card relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} anim-rise max-h-[88vh] overflow-y-auto shadow-2xl shadow-black/50`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-mut transition-colors hover:bg-panel-2 hover:text-ink"
            aria-label="Close dialog"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 anim-rise">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mut">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="rounded-xl border border-line bg-panel-2 p-3 text-mut-2">{icon}</div>
      <p className="mt-2 text-sm font-semibold text-mut">{title}</p>
      {sub && <p className="max-w-sm text-xs text-mut-2">{sub}</p>}
    </div>
  );
}

// Shown instead of a raw 403 whenever a role is not allowed to open a page.
// Gives a clear authorization error plus a way back, instead of a dead end.
export function AccessDenied({
  title = "Access restricted",
  message,
  linkHref = "/dashboard",
  linkLabel = "Back to dashboard",
}: {
  title?: string;
  message: string;
  linkHref?: string;
  linkLabel?: string;
}) {
  return (
    <div className="card anim-rise mx-auto mt-10 max-w-lg p-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300">
        <IconAlert className="h-6 w-6" />
      </span>
      <h1 className="mt-4 font-display text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-mut">{message}</p>
      <Link href={linkHref} className="btn btn-primary mt-6">
        {linkLabel}
      </Link>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const AVATAR_HUES = [
  "from-cyan-500/30 to-blue-600/30 text-cyan-200 border-cyan-400/30",
  "from-violet-500/30 to-fuchsia-600/30 text-violet-200 border-violet-400/30",
  "from-emerald-500/30 to-teal-600/30 text-emerald-200 border-emerald-400/30",
  "from-amber-500/30 to-orange-600/30 text-amber-200 border-amber-400/30",
  "from-sky-500/30 to-indigo-600/30 text-sky-200 border-sky-400/30",
];

export function Avatar({ name, size = "h-9 w-9" }: { name: string; size?: string }) {
  // Pick a stable color based on the name so the same user always matches.
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br font-display text-xs font-bold ${size} ${AVATAR_HUES[hash % AVATAR_HUES.length]}`}
    >
      {initials(name)}
    </span>
  );
}
