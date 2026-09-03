// Profile — account overview plus profile and password management.

import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_META, formatDate } from "@/lib/format";
import { Avatar, Badge, PageHeader } from "@/components/ui";
import { PasswordForm, ProfileForm, type AccountUser } from "@/components/account-client";
import { IconKey, IconUser } from "@/components/icons";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user } = await requireUser();
  const role = ROLE_META[user.role] ?? { label: user.role, tone: "slate" as const };

  // The form components are client — hand them plain serializable data.
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
      <PageHeader title="Profile" sub="Your account identity and credentials." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Identity card */}
        <div className="card p-5 anim-rise-1">
          <div className="flex flex-col items-center text-center">
            <Avatar name={user.fullName} size="h-16 w-16" />
            <h2 className="mt-3 font-display text-lg font-semibold">{user.fullName}</h2>
            <p className="text-sm text-mut-2">@{user.username}</p>
            <div className="mt-3">
              <Badge tone={role.tone}>{role.label}</Badge>
            </div>
          </div>
          <dl className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-mut-2">Email</dt>
              <dd className="truncate font-medium">{user.email}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-mut-2">Member since</dt>
              <dd className="font-medium">{formatDate(user.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-mut-2">Status</dt>
              <dd>
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                </span>
              </dd>
            </div>
          </dl>
        </div>

        {/* Edit forms */}
        <div className="card p-5 anim-rise-2">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
              <IconUser className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-semibold">Account details</h2>
          </div>
          <ProfileForm user={account} />
        </div>

        <div className="card p-5 anim-rise-3">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
              <IconKey className="h-4 w-4" />
            </span>
            <h2 className="font-display text-sm font-semibold">Change password</h2>
          </div>
          <PasswordForm />
        </div>
      </div>
    </>
  );
}
