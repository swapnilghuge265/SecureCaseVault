import RevokeSessionsButton from "@/components/revoke-sessions-button";
import SessionDate from "@/components/session-date";
import { redirect } from "next/navigation";

import { and, desc, eq, gt } from "drizzle-orm";

import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { can, getSessionUser } from "@/lib/auth";

export default async function SessionsPage() {
  const auth = await getSessionUser();

  if (!auth) {
    redirect("/login");
  }

  if (!can(auth.user.role, "manageUsers")) {
    redirect("/dashboard");
  }

  const rows = await db
    .select({
      username: users.username,
      fullName: users.fullName,
      device: sessions.device,
      ipAddress: sessions.ipAddress,
      createdAt: sessions.createdAt,
      lastActivity: sessions.lastActivity,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(users.status, "active"),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessions.lastActivity));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Active Sessions
        </h1>

        <p className="mt-1 text-sm text-mut">
          Monitor currently valid user sessions, devices, IP addresses,
          activity and expiry times.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full">
            <thead>
              <tr className="border-b border-line">
                <th className="th">User</th>
                <th className="th">Device</th>
                <th className="th">IP Address</th>
                <th className="th">Login Time</th>
                <th className="th">Last Activity</th>
                <th className="th">Expires</th>
                <th className="th">Actions</th>
              </tr>
            </thead>

            <tbody>
              {rows.map((session, index) => (
                <tr
                  key={`${session.username}-${session.createdAt.toISOString()}-${index}`}
                  className="border-b border-line last:border-0"
                >
                  <td className="td">
                    <div className="font-medium text-ink">
                      {session.username}
                    </div>

                    <div className="text-xs text-mut">
                      {session.fullName}
                    </div>
                  </td>

                  <td className="td whitespace-nowrap">
                    {session.device ?? "🌐 Unknown"}
                  </td>

                  <td className="td font-mono text-xs text-mut-2">
                    {session.ipAddress ?? "—"}
                  </td>

                  <td className="td whitespace-nowrap text-sm">
                    <SessionDate
                      date={session.createdAt.toISOString()}
                    />
                  </td>

                  <td className="td whitespace-nowrap text-sm">
                    <SessionDate
                      date={session.lastActivity.toISOString()}
                    />
                  </td>

                  <td className="td whitespace-nowrap text-sm">
                    <SessionDate
                      date={session.expiresAt.toISOString()}
                    />
                  </td>

                  <td className="td">
                    <RevokeSessionsButton
                      username={session.username}
                    />
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-mut"
                  >
                    No active sessions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}