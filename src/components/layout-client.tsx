"use client";

// ---------------------------------------------------------------------------
// AppShell — the persistent chrome around every authenticated page:
// sidebar navigation + top bar + main content area.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_META } from "@/lib/format";
import { Avatar, Badge, Spinner } from "./ui";
import {
  IconBell,
  IconCog,
  IconDashboard,
  IconFileText,
  IconFolder,
  IconList,
  IconLogout,
  IconMenu,
  IconShield,
  IconUser,
  IconUsers,
  IconX,
} from "./icons";

export interface ShellUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
}

// Nav config. Items with `adminOnly: true` are filtered out at render time
// for other roles — hiding them in the UI is convenience only; the pages
// and API routes themselves still enforce the permission server-side.
const NAV: {
  group: string;
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[];
}[] = [
  {
    group: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: IconDashboard }],
  },
  {
    group: "Management",
    items: [
      { href: "/documents", label: "Documents", icon: IconFileText },
      { href: "/cases", label: "Cases", icon: IconFolder },
      { href: "/users", label: "Users", icon: IconUsers, adminOnly: true },
    ],
  },
  {
    group: "Security",
    items: [
      { href: "/audit", label: "Audit Logs", icon: IconList, adminOnly: true },
      { href: "/alerts", label: "Security Alerts", icon: IconBell, adminOnly: true },
    ],
  },
  {
    group: "Account",
    items: [
      { href: "/profile", label: "Profile", icon: IconUser },
      { href: "/settings", label: "Settings", icon: IconCog },
    ],
  },
];

export default function AppShell({
  user,
  alertCount,
  children,
}: {
  user: ShellUser;
  alertCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const roleMeta = ROLE_META[user.role] ?? { label: user.role, tone: "slate" as const };
  const isAdmin = user.role === "administrator";

  // Filter admin-only items (Users, Audit Logs, Security Alerts) out of the
  // navigation for every other role.
  const nav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.adminOnly || isAdmin),
  })).filter((section) => section.items.length > 0);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Full navigation guarantees stale server data is discarded.
      window.location.href = "/login";
    }
  }

  const Sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <Link href="/dashboard" className="flex items-center gap-3 px-5 pb-6 pt-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400/20 to-blue-600/20 text-cyan-300">
          <IconShield className="h-5.5 w-5.5 h-[22px] w-[22px]" />
        </span>
        <span className="leading-tight">
          <span className="block font-display text-[15px] font-bold tracking-tight text-ink">
            SecureCase
          </span>
          <span className="block font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300">
            Vault
          </span>
        </span>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {nav.map((section) => (
          <div key={section.group}>
            <p className="px-2.5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-mut-2">
              {section.group}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-cyan-400/10 text-cyan-300"
                          : "text-mut hover:bg-panel-2 hover:text-ink"
                      }`}
                    >
                      <Icon
                        className={`h-4.5 w-4.5 h-[18px] w-[18px] ${
                          active ? "" : "text-mut-2 group-hover:text-mut"
                        }`}
                      />
                      {item.label}
                      {item.href === "/alerts" && alertCount > 0 && (
                        <span className="ml-auto rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                          {alertCount}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer: user + logout */}
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.fullName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user.fullName}</p>
            <p className="truncate text-[11px] text-mut-2">@{user.username}</p>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            title="Sign out"
            className="rounded-lg border border-line-2 p-2 text-mut transition-colors hover:border-rose-500/40 hover:text-rose-300"
          >
            {loggingOut ? <Spinner className="h-4 w-4" /> : <IconLogout className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-widest text-mut-2">
          v1.0 · Educational prototype
        </p>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-panel lg:block">
        {Sidebar}
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-[#02060d]/70"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-panel anim-rise">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 rounded-md p-1.5 text-mut hover:text-ink"
              aria-label="Close menu"
            >
              <IconX className="h-5 w-5" />
            </button>
            {Sidebar}
          </aside>
        </div>
      )}

      {/* Right column */}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-line bg-base/85 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 md:px-6">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-line-2 p-2 text-mut lg:hidden"
              aria-label="Open menu"
            >
              <IconMenu className="h-4.5 w-4.5 h-[18px] w-[18px]" />
            </button>

            <div className="flex items-center gap-2 text-xs font-semibold text-mut-2">
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 pulse-dot" />
                Operations console
              </span>
            </div>

            <div className="ml-auto flex items-center gap-3">
              {isAdmin && (
                <Link
                  href="/alerts"
                  className="relative rounded-lg border border-line-2 p-2 text-mut transition-colors hover:border-cyan-400/40 hover:text-ink"
                  title="Security alerts"
                >
                  <IconBell className="h-[18px] w-[18px]" />
                  {alertCount > 0 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {alertCount}
                    </span>
                  )}
                </Link>
              )}
              <div className="flex items-center gap-2.5">
                <Avatar name={user.fullName} size="h-8 w-8" />
                <div className="hidden sm:block">
                  <p className="text-[13px] font-semibold leading-tight">{user.fullName}</p>
                  <span className={`text-[11px] font-semibold ${
                    user.role === "administrator" ? "text-cyan-300" : "text-mut-2"
                  }`}>
                    {roleMeta.label}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 bg-grid">
          <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export { Badge };
