// Authenticated area layout: guards every page here, loads the signed-in
// user + open-alert count and renders the sidebar/topbar shell.

import { eq, sql } from "drizzle-orm";
import type { ReactNode } from "react";
import { db } from "@/db";
import { securityAlerts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import AppShell from "@/components/layout-client";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireUser();
  const [alertRow] = await db
    .select({ n: sql<number>`count(*)` })
    .from(securityAlerts)
    .where(eq(securityAlerts.status, "new"));

  return (
    <AppShell
      user={{ id: user.id, username: user.username, fullName: user.fullName, role: user.role }}
      alertCount={Number(alertRow?.n ?? 0)}
    >
      {children}
    </AppShell>
  );
}
