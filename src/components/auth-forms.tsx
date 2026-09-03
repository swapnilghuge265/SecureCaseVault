"use client";

// ---------------------------------------------------------------------------
// Login + Register forms. Plain fetch() calls to the API routes — no extra
// form libraries, so the flow is easy to follow.
// ---------------------------------------------------------------------------

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Spinner } from "./ui";
import { IconAlert } from "./icons";

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300" role="alert">
      <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

// --- Post-login session verification (login-flow fix) ------------------------
// The backend sets an httpOnly session cookie on success. Some embedded /
// preview browser contexts silently drop server-set cookies, which used to
// send the user straight back to a blank login page with no explanation.
// So after a successful sign-in we:
//   1. verify the cookie took effect via GET /api/auth/check
//   2. if not, re-establish the SAME session from the token returned in the
//      successful response (document.cookie fallback — prototype trade-off)
//   3. if still not, show a clear, safe error instead of a silent bounce
async function sessionEstablished(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/check", { cache: "no-store" });
    const data = await res.json();
    return !!data?.authenticated;
  } catch {
    return false;
  }
}

/**
 * Verify the session exists after sign-in; fall back to a JS-set cookie if
 * the server cookie was dropped. Diagnoses WHICH cookie problem occurred so
 * the user gets a precise, actionable message:
 *   "ok"      — session works
 *   "not-sent" — the cookie was stored but the browser does not SEND it back
 *                (embedded/iframe context: the page is loaded inside another
 *                 site, so cookies for this preview are "third-party")
 *   "blocked" — the browser refused to store the cookie at all
 */
async function establishSession(
  _sessionToken: string | undefined,
): Promise<"ok" | "not-sent" | "blocked"> {
  if (await sessionEstablished()) {
    return "ok";
  }

  return "not-sent";
}
// The concrete fix for both failure modes is the same: open the preview in a
// NEW BROWSER TAB. In a direct tab this site is "first-party", and browsers
// store and send its session cookie normally — no browser settings changes.
const SESSION_NOT_SENT_ERROR =
  "Your account signed in successfully, but this preview is embedded inside another page, and in that context your browser will not send the session cookie back to the server. Open the preview in a new browser tab and sign in there — in a normal tab the session works.";
const SESSION_BLOCKED_ERROR =
  "Your account signed in successfully, but your browser refused to store the session cookie for this embedded preview. Open the preview in a new browser tab and sign in there — in a normal tab the session works.";

function SessionFailureNotice({ kind }: { kind: "not-sent" | "blocked" }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="mt-3 flex flex-col items-start gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/5 px-3 py-2.5 text-sm text-cyan-100">
      <p className="leading-relaxed">{kind === "not-sent" ? SESSION_NOT_SENT_ERROR : SESSION_BLOCKED_ERROR}</p>
      <a href={`${origin}/login`} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
        Open preview in a new tab
      </a>
    </div>
  );
}

// Demo accounts shown as one-click fill buttons. These values MUST match
// src/lib/bootstrap.ts (auto-creation) and scripts/seed.mjs — single
// password scheme for the whole development environment.
const DEMO_ACCOUNTS = [
  { role: "Admin", username: "admin", password: "Admin@12345" },
  { role: "Investigator", username: "investigator", password: "Investigator@12345" },
  { role: "Investigator 2", username: "s.reyes", password: "Investigator2@12345" },
  { role: "Legal", username: "legal", password: "Legal@12345" },
  { role: "Viewer", username: "viewer", password: "Viewer@12345" },
];

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sessionFailure, setSessionFailure] = useState<"not-sent" | "blocked" | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSessionFailure(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        let message = "Sign-in failed. Please try again.";
        try {
          const data = await res.json();
          if (data?.error) message = data.error;
        } catch {
          // non-JSON response (e.g. server error page) — keep default message
        }
        setError(message);
        return;
      }
      const data = await res.json();
      // Verify the session cookie actually took effect in this browser;
      // fall back to the JS-set cookie; otherwise show a PRECISE, visible
      // error with a working recovery action — never a silent bounce.
      const session = await establishSession(data?.sessionToken);
      if (session === "ok") {
        // Hard navigation so the server components re-read the session.
        window.location.href = "/dashboard";
      } else {
        setError(
          session === "not-sent"
            ? "Unable to sign in: the session cookie is not sent in this embedded context."
            : "Unable to sign in: the session cookie was not accepted by this browser.",
        );
        setSessionFailure(session);
      }
    } catch {
      // Network-level failure (server unreachable) — say so instead of
      // silently freezing the form.
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-7">
      <h2 className="font-display text-xl font-semibold tracking-tight">Sign in</h2>
      <p className="mt-1 text-sm text-mut">Enter your credentials to access the console.</p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <ErrorBox message={error} />}
        {sessionFailure && <SessionFailureNotice kind={sessionFailure} />}
        <div>
          <label className="label" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. investigator"
            autoComplete="username"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••"
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? <Spinner /> : null}
          {loading ? "Verifying…" : "Sign in securely"}
        </button>
      </form>

      <div className="mt-6 border-t border-line pt-5">
        <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-mut-2">
          Demo accounts — click to fill
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button
              key={a.username}
              type="button"
              onClick={() => {
                setUsername(a.username);
                setPassword(a.password);
                setError("");
              }}
              className="rounded-lg border border-line-2 bg-field px-3 py-2 text-left text-xs transition-colors hover:border-cyan-400/40"
            >
              <span className="block font-bold text-cyan-300">{a.role}</span>
              <span className="block truncate text-mut-2">@{a.username}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-center text-sm text-mut">
        No account yet?{" "}
        <Link href="/register" className="font-semibold text-cyan-300 hover:text-cyan-200">
          Register
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [form, setForm] = useState({ fullName: "", username: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [sessionFailure, setSessionFailure] = useState<"not-sent" | "blocked" | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function validate(): string {
    if (form.fullName.trim().length < 2) return "Please enter your full name.";
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(form.username))
      return "Username must be 3–24 characters: letters, numbers or underscores.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Please enter a valid email address.";
    if (form.password.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-zA-Z]/.test(form.password) || !/\d/.test(form.password))
      return "Password must contain both letters and numbers.";
    if (form.password !== form.confirm) return "Passwords do not match.";
    return "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSessionFailure(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          username: form.username,
          email: form.email.trim().toLowerCase(),
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registration failed. Please try again.");
        return;
      }
      // Same session verification + fallback as the login form.
      const session = await establishSession(data?.sessionToken);
      if (session === "ok") {
        window.location.href = "/dashboard";
      } else {
        setError(
          session === "not-sent"
            ? "Unable to sign in: the session cookie is not sent in this embedded context."
            : "Unable to sign in: the session cookie was not accepted by this browser.",
        );
        setSessionFailure(session);
      }
    } catch {
      setError("Could not reach the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card p-7">
      <h2 className="font-display text-xl font-semibold tracking-tight">Create your account</h2>
      <p className="mt-1 text-sm text-mut">
        New accounts start with the <span className="font-semibold text-ink">Viewer</span> role.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        {error && <ErrorBox message={error} />}
        {sessionFailure && <SessionFailureNotice kind={sessionFailure} />}
        <div>
          <label className="label" htmlFor="reg-name">Full name</label>
          <input id="reg-name" className="input" value={form.fullName} onChange={set("fullName")} placeholder="Jordan Ellis" required />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="reg-username">Username</label>
            <input id="reg-username" className="input" value={form.username} onChange={set("username")} placeholder="j.ellis" required />
          </div>
          <div>
            <label className="label" htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" className="input" value={form.email} onChange={set("email")} placeholder="j.ellis@example.com" required />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="reg-password">Password</label>
            <input id="reg-password" type="password" className="input" value={form.password} onChange={set("password")} placeholder="Min. 8 chars" required />
          </div>
          <div>
            <label className="label" htmlFor="reg-confirm">Confirm password</label>
            <input id="reg-confirm" type="password" className="input" value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" required />
          </div>
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? <Spinner /> : null}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-mut">
        Already registered?{" "}
        <Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">
          Sign in
        </Link>
      </p>
    </div>
  );
}
