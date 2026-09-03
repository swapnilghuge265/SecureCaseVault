"use client";

// ---------------------------------------------------------------------------
// Users table (client side): role changes and suspend/activate actions.
// Your own row is read-only — an admin can never lock themselves out.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Spinner } from "./ui";
import { ROLE_META, formatDate } from "@/lib/format";
import { IconCheck, IconShieldCheck } from "./icons";

export interface UserRow {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}

const ALL_ROLES = ["administrator", "investigator", "legal_officer", "viewer"];

export default function UsersClient({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmSuspend, setConfirmSuspend] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function patch(id: number, body: { role?: string; status?: string }) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "The change could not be applied.");
      setConfirmSuspend(null);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300 anim-rise">
          {error}
        </div>
      )}
      <div className="card overflow-hidden anim-rise-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px]">
            <thead className="border-b border-line bg-panel-2/60">
              <tr>
                <th className="th">User</th>
                <th className="th">Email</th>
                <th className="th">Role</th>
                <th className="th">Status</th>
                <th className="th">Member since</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const role = ROLE_META[u.role] ?? { label: u.role, tone: "slate" as const };
                return (
                  <tr key={u.id} className="transition-colors hover:bg-panel-2/40">
                    <td className="td">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.fullName} size="h-8 w-8" />
                        <div>
                          <p className="font-medium">
                            {u.fullName}
                            {isSelf && <span className="ml-2 text-xs font-semibold text-cyan-300">(you)</span>}
                          </p>
                          <p className="text-xs text-mut-2">@{u.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className="td text-mut">{u.email}</td>
                    <td className="td">
                      {isSelf ? (
                        <Badge tone={role.tone}>{role.label}</Badge>
                      ) : (
                        <select
                          className="input w-auto py-1.5 text-xs"
                          value={u.role}
                          disabled={busyId === u.id}
                          onChange={(e) => patch(u.id, { role: e.target.value })}
                          aria-label={`Role for ${u.username}`}
                        >
                          {ALL_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_META[r]?.label ?? r}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={u.status === "active" ? "emerald" : "rose"} dot={u.status === "active"}>
                        {u.status === "active" ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                    <td className="td text-mut">{formatDate(u.createdAt)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-2">
                        {isSelf ? (
                          <span className="text-[11px] font-medium text-mut-2">
                            Ask another administrator
                          </span>
                        ) : u.status === "active" ? (
                          confirmSuspend === u.id ? (
                            <>
                              <span className="text-[11px] font-bold text-rose-300">Suspend this account?</span>
                              <button
                                className="btn btn-danger btn-sm"
                                disabled={busyId === u.id}
                                onClick={() => patch(u.id, { status: "suspended" })}
                              >
                                {busyId === u.id ? <Spinner className="h-3.5 w-3.5" /> : <IconShieldCheck className="h-3.5 w-3.5" />}
                                Suspend
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmSuspend(null)}>
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn btn-danger btn-sm"
                              disabled={busyId === u.id}
                              onClick={() => setConfirmSuspend(u.id)}
                            >
                              {busyId === u.id ? <Spinner className="h-3.5 w-3.5" /> : null}
                              Suspend
                            </button>
                          )
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm hover:border-emerald-400/40 hover:text-emerald-300"
                            disabled={busyId === u.id}
                            onClick={() => patch(u.id, { status: "active" })}
                          >
                            {busyId === u.id ? <Spinner className="h-3.5 w-3.5" /> : <IconCheck className="h-3.5 w-3.5" />}
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-2.5 text-xs text-mut-2">
          {users.length} accounts · role changes raise a security alert · suspending a user signs
          them out immediately
        </div>
      </div>
    </>
  );
}
