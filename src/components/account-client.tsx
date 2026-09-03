"use client";

// ---------------------------------------------------------------------------
// Profile & Settings interactive parts: profile form, password change,
// notification toggles and "end session".
// ---------------------------------------------------------------------------

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "./ui";
import { formatDate, formatDateTime } from "@/lib/format";
import { IconCheck, IconLogout } from "./icons";

export interface AccountUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  notifySecurity: boolean;
  notifyDigest: boolean;
  createdAt: string;
}

function FormNote({ ok, message }: { ok: boolean; message: string }) {
  if (!message) return null;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
        ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-500/30 bg-rose-500/10 text-rose-300"
      }`}
    >
      <IconCheck className="h-4 w-4" /> {message}
    </div>
  );
}

// --- Profile form (name + email) -------------------------------------------

export function ProfileForm({ user }: { user: AccountUser }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (fullName.trim().length < 2) return setMessage({ ok: false, text: "Name must be at least 2 characters." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setMessage({ ok: false, text: "Enter a valid email address." });
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Could not save changes." });
      setMessage({ ok: true, text: "Profile updated." });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {message && <FormNote ok={message.ok} message={message.text} />}
      <div>
        <label className="label" htmlFor="pf-name">Full name</label>
        <input id="pf-name" className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="pf-email">Email</label>
        <input id="pf-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <span className="label">Username</span>
        <input className="input opacity-50" value={user.username} disabled />
        <p className="mt-1.5 text-[11px] text-mut-2">Usernames cannot be changed in this prototype.</p>
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading && <Spinner />} Save changes
      </button>
    </form>
  );
}

// --- Password change ---------------------------------------------------------

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next.length < 8) return setMessage({ ok: false, text: "New password must be at least 8 characters." });
    if (!/[a-zA-Z]/.test(next) || !/\d/.test(next))
      return setMessage({ ok: false, text: "New password must contain letters and numbers." });
    if (next !== confirm) return setMessage({ ok: false, text: "New passwords do not match." });
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json();
      if (!res.ok) return setMessage({ ok: false, text: data.error ?? "Password change failed." });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ ok: true, text: "Password changed successfully." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {message && <FormNote ok={message.ok} message={message.text} />}
      <div>
        <label className="label" htmlFor="pw-current">Current password</label>
        <input id="pw-current" type="password" className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pw-next">New password</label>
          <input id="pw-next" type="password" className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">Confirm new password</label>
          <input id="pw-confirm" type="password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading && <Spinner />} Update password
      </button>
    </form>
  );
}

// --- Notification toggles (Settings) -----------------------------------------

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${
        on ? "border-cyan-400/60 bg-cyan-400/30" : "border-line-2 bg-field"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 h-[18px] w-[18px] rounded-full transition-all ${
          on ? "left-[22px] bg-cyan-300" : "left-0.5 bg-mut-2"
        }`}
      />
    </button>
  );
}

export function NotificationToggles({
  user,
}: {
  user: AccountUser;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);

  async function setPref(key: "notifySecurity" | "notifyDigest", value: boolean) {
    setSaving(key);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      router.refresh();
    } finally {
      setSaving(null);
    }
  }

  const rows: { key: "notifySecurity" | "notifyDigest"; title: string; sub: string }[] = [
    {
      key: "notifySecurity",
      title: "Security alerts",
      sub: "Notify me about alerts related to my activity (failed logins, sensitive downloads).",
    },
    {
      key: "notifyDigest",
      title: "Weekly summary",
      sub: "Send a digest of new cases and documents I own or can access.",
    },
  ];

  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-panel-2/40">
          <div>
            <p className="text-sm font-semibold">{r.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-mut-2">{r.sub}</p>
          </div>
          {saving === r.key ? (
            <Spinner className="h-4 w-4 text-mut" />
          ) : (
            <Toggle on={user[r.key]} onChange={(v) => setPref(r.key, v)} label={r.title} />
          )}
        </div>
      ))}
    </div>
  );
}

// --- End session (Settings) ---------------------------------------------------

export function EndSessionButton() {
  const [busy, setBusy] = useState(false);
  async function end() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }
  return (
    <button className="btn btn-danger" onClick={end} disabled={busy}>
      {busy ? <Spinner /> : <IconLogout className="h-4 w-4" />}
      {busy ? "Signing out…" : "End this session"}
    </button>
  );
}

// Re-exported for the settings page session card.
export { formatDate, formatDateTime };
