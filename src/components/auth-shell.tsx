// ---------------------------------------------------------------------------
// Shared layout for the Login and Register pages: branded left panel with a
// product overview, and a centered form card on the right.
// ---------------------------------------------------------------------------

import type { ReactNode } from "react";
import { IconActivity, IconList, IconShield, IconShieldCheck } from "./icons";

const FEATURES = [
  {
    icon: IconShieldCheck,
    title: "Role-based access",
    sub: "Administrator, Investigator, Legal Officer and Viewer roles with distinct permissions.",
  },
  {
    icon: IconList,
    title: "Full audit trail",
    sub: "Every sign-in, upload, download and edit is recorded in an append-only log.",
  },
  {
    icon: IconActivity,
    title: "Security alerts",
    sub: "Automatic alerts for failed logins, sensitive uploads and unusual activity.",
  },
];

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-line bg-panel p-10 lg:flex">
        <div className="bg-grid absolute inset-0" aria-hidden="true" />
        <div
          className="absolute -top-32 left-1/3 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 text-cyan-300">
            <IconShield className="h-6 w-6" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-lg font-bold tracking-tight">SecureCaseVault</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Document Security Console
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-3xl font-semibold leading-snug tracking-tight">
            Sensitive case files,
            <span className="text-cyan-300"> organized and accounted for.</span>
          </h1>
          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3.5">
                <span className="mt-0.5 rounded-lg border border-line-2 bg-panel-2 p-2 text-cyan-300">
                  <f.icon className="h-4 w-4" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-mut">{f.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-mut-2">
          Educational portfolio prototype — demo data only. Do not store real evidence or personal
          data.
        </p>
      </div>

      {/* Form panel */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div
          className="absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative w-full max-w-md anim-rise">{children}</div>
      </div>
    </div>
  );
}
