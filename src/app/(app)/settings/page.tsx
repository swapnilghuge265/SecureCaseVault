// Settings — notification preferences, active session info, the security
// model actually implemented by this prototype, and project information.

import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PERMISSION_DESCRIPTIONS } from "@/lib/auth";
import { ROLE_META, formatDate, formatDateTime } from "@/lib/format";
import { Badge, PageHeader } from "@/components/ui";
import {
  EndSessionButton,
  NotificationToggles,
  type AccountUser,
} from "@/components/account-client";
import {
  IconBell,
  IconClock,
  IconDatabase,
  IconLock,
  IconShieldCheck,
} from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };

const SECURITY_FACTS = [
  { title: "Password storage", sub: "Passwords are hashed with bcrypt (cost 10) — plain text is never stored." },
  { title: "Session security", sub: "Random 256-bit tokens in httpOnly cookies; sessions expire after 7 days." },
  { title: "Role-based access", sub: "Every API route and UI action is checked against the role permission matrix." },
  { title: "Encryption at rest", sub: "Document bytes are encrypted with AES-256-GCM before they reach the database. The key lives only in the SCV_ENCRYPTION_KEY environment variable — never in the database, never in the frontend, never in code." },
  { title: "Document integrity", sub: "Each upload is fingerprinted with a SHA-256 hash for integrity verification. That is a different job from encryption — one checks the file hasn’t changed, the other protects it from being read." },
  { title: "Secure storage", sub: "File bytes live in PostgreSQL behind authenticated, role-checked endpoints — never in a web-served folder. Storage names are random; original names are sanitized against path traversal." },
  { title: "Upload restrictions", sub: "Six prototype formats only (PDF, DOCX, XLSX, JPG, PNG, TXT), whitelisted extensions, 10 MB cap." },
  { title: "Automatic alerts", sub: "Failed logins, Top Secret uploads and sensitive downloads raise alerts." },
];

export default async function SettingsPage() {
  const { user, session } = await requireUser();
  const role = ROLE_META[user.role] ?? { label: user.role, tone: "slate" as const };

  const account: AccountUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    notifySecurity: user.notifySecurity,
    notifyDigest: user.notifyDigest,
    createdAt: user.createdAt.toISOString(),
  };

  return (
    <>
      <PageHeader title="Settings" sub="Preferences, session and how this prototype protects your data." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Notifications */}
        <div className="card p-5 anim-rise-1">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
              <IconBell className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-semibold">Notification preferences</h2>
          </div>
          <NotificationToggles user={account} />
        </div>

        {/* Active session */}
        <div className="card p-5 anim-rise-2">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
              <IconClock className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-semibold">Active session</h2>
          </div>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-mut-2">Signed in</dt>
              <dd className="font-medium">{formatDateTime(session.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-mut-2">Expires</dt>
              <dd className="font-medium">{formatDate(session.expiresAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-mut-2">Session IP</dt>
              <dd className="font-mono text-xs font-medium">{session.ipAddress ?? "—"}</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <EndSessionButton />
          </div>
        </div>

        {/* Security model */}
        <div className="card p-5 anim-rise-2">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
              <IconShieldCheck className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-semibold">Security model</h2>
          </div>
          <ul className="space-y-3">
            {SECURITY_FACTS.map((f) => (
              <li key={f.title} className="flex gap-3">
                <IconLock className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300/70" />
                <span>
                  <span className="block text-[13px] font-semibold">{f.title}</span>
                  <span className="block text-xs leading-relaxed text-mut-2">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2.5 text-xs leading-relaxed text-amber-200/90">
            This is an educational prototype. It is not hardened against determined attackers and
            must not be used for real evidence, investigations or personal data.
          </p>
        </div>

        {/* Role permissions */}
        <div className="card p-5 anim-rise-3">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
              <IconDatabase className="h-4 w-4" />
            </span>
            <div>
              <h2 className="font-display text-sm font-semibold">Your permissions</h2>
              <div className="mt-1">
                <Badge tone={role.tone}>{role.label}</Badge>
              </div>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {PERMISSION_DESCRIPTIONS.map((p) => {
              const allowed = p.roles.includes(user.role);
              return (
                <li key={p.action} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="text-[13px] text-mut">{p.action}</span>
                  <span
                    className={`text-xs font-bold uppercase tracking-wide ${
                      allowed ? "text-emerald-300" : "text-mut-2"
                    }`}
                  >
                    {allowed ? "Allowed" : "Not allowed"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
