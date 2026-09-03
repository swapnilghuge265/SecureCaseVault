// Users — administrator-only account management: change roles, suspend or
// reactivate accounts. Suspended users are blocked immediately because the
// session check re-reads the account status on every request.

import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { ROLE_META } from "@/lib/format";
import { AccessDenied, PageHeader } from "@/components/ui";
import UsersClient from "@/components/users-client";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const { user } = await requireUser();

  // Clear authorization error instead of a raw 404 / blank page.
  if (!can(user.role, "manageUsers")) {
    return (
      <AccessDenied
        message={`Managing user accounts requires the Administrator role. You are signed in as ${
          ROLE_META[user.role]?.label ?? user.role
        }. If you believe you need access, contact an administrator.`}
      />
    );
  }

  const rows = await db.select().from(users).orderBy(asc(users.createdAt));

  return (
    <>
      <PageHeader
        title="Users"
        sub="Assign roles and control account status. Changes are written to the audit log."
      />
      <UsersClient
        users={rows.map((u) => ({
          id: u.id,
          username: u.username,
          fullName: u.fullName,
          email: u.email,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt.toISOString(),
        }))}
        currentUserId={user.id}
      />
    </>
  );
}
