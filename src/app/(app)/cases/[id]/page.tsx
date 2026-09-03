// Case detail — metadata, description, the case's documents and the
// activity trail for everything that belongs to this case.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, cases, documents, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { visibleCaseIds, visibleDocumentIds } from "@/lib/visibility";
import { CaseEditButton, type InvestigatorOption } from "@/components/cases-client";
import {
  ACTION_LABELS,
  CASE_STATUS_META,
  PRIORITY_META,
  ROLE_META,
  SECURITY_META,
  formatBytes,
  formatDateTime,
} from "@/lib/format";
import { AccessDenied, Badge, EmptyState, PageHeader } from "@/components/ui";
import { IconChevronRight, IconDownload, IconFileText, IconFolder } from "@/components/icons";

export const metadata: Metadata = { title: "Case detail" };

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireUser();
  const { id } = await params;
  const caseId = Number(id);

  const [caseRow] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!caseRow) notFound();

  // Authorization: only users whose visibility includes this case may open
  // it — typing a case URL directly cannot bypass the case list filter.
  const vis = await visibleCaseIds(user);
  if (!vis.all && !vis.ids.includes(caseId)) {
    return (
      <AccessDenied
        message={`This case is not assigned to you and no document from it has been shared with you. Your role (${
          ROLE_META[user.role]?.label ?? user.role
        }) can only open assigned cases. Ask the case owner or an administrator for access.`}
      />
    );
  }

  const ownerRows = await db
    .select({ id: users.id, fullName: users.fullName, role: users.role, status: users.status })
    .from(users);

  // Fetch the case's documents, then filter through the global document
  // visibility rules. This correctly handles every role:
  //  - the case owner/creator sees every document in the case
  //  - a user who reached the case *only* through a shared document sees
  //    just that shared document (the rest of the case stays hidden)
  //  - viewers see only their shared documents
  const allDocs = await db
    .select()
    .from(documents)
    .where(eq(documents.caseId, caseId))
    .orderBy(desc(documents.createdAt));
  const docVis = await visibleDocumentIds(user);
  const docs = docVis.all ? allDocs : allDocs.filter((d) => docVis.ids.includes(d.id));

  // Activity = case-level actions + actions on any document in this case.
  const activity = await db
    .select()
    .from(auditLogs)
    .where(
      or(
        and(eq(auditLogs.resourceType, "case"), eq(auditLogs.resourceId, String(caseId))),
        and(
          eq(auditLogs.resourceType, "document"),
          inArray(auditLogs.resourceId, docs.map((d) => String(d.id))),
        ),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(12);

  const ownerMap = new Map(ownerRows.map((u) => [u.id, u]));
  const owner = ownerMap.get(caseRow.ownerId);
  const status = CASE_STATUS_META[caseRow.status] ?? { label: caseRow.status, tone: "slate" as const };
  const priority = PRIORITY_META[caseRow.priority] ?? { label: caseRow.priority, tone: "slate" as const };

  // Assignable investigators for the edit form (active investigator-role
  // accounts, plus the current assignee if that isn't one of them).
  const investigatorOptions: InvestigatorOption[] = ownerRows
    .filter((u) => u.role === "investigator" && u.status === "active")
    .map((u) => ({ id: u.id, fullName: u.fullName }));
  if (owner && !investigatorOptions.some((o) => o.id === owner.id)) {
    investigatorOptions.push({ id: owner.id, fullName: `${owner.fullName} (current)` });
  }

  return (
    <>
      <div className="mb-4">
        <Link
          href="/cases"
          className="inline-flex items-center gap-1 text-xs font-semibold text-mut transition-colors hover:text-cyan-300"
        >
          <IconChevronRight className="h-3.5 w-3.5 rotate-180" /> Back to cases
        </Link>
      </div>

      <PageHeader title={caseRow.title} sub={`${caseRow.caseNumber} · ${caseRow.category}`}>
        <Badge tone={status.tone} dot={caseRow.status === "investigating"}>
          {status.label}
        </Badge>
        <Badge tone={priority.tone}>{priority.label} priority</Badge>
        {can(user.role, "updateCase") && (
          <CaseEditButton
            initial={{
              id: caseRow.id,
              caseNumber: caseRow.caseNumber,
              title: caseRow.title,
              category: caseRow.category,
              status: caseRow.status,
              priority: caseRow.priority,
              ownerId: caseRow.ownerId,
              ownerName: owner?.fullName ?? "Unknown",
              docCount: docs.length,
              updatedAt: caseRow.updatedAt.toISOString(),
              description: caseRow.description ?? "",
            }}
            investigators={investigatorOptions}
          />
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Description */}
          <div className="card p-5 anim-rise-1">
            <h2 className="font-display text-sm font-semibold">Case summary</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-mut">
              {caseRow.description || "No description provided for this case."}
            </p>
          </div>

          {/* Documents in this case */}
          <div className="card overflow-hidden anim-rise-2">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <h2 className="font-display text-sm font-semibold">
                Documents <span className="text-mut-2">({docs.length})</span>
              </h2>
              <Link href="/documents" className="text-xs font-semibold text-cyan-300 hover:text-cyan-200">
                All documents →
              </Link>
            </div>
            {docs.length === 0 ? (
              <EmptyState
                icon={<IconFileText className="h-6 w-6" />}
                title="No documents yet"
                sub="Files uploaded to this case will appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {docs.map((d) => {
                  const level =
                    SECURITY_META[d.securityLevel] ?? { label: d.securityLevel, tone: "slate" as const };
                  return (
                    <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-panel-2/40">
                      <span className="rounded-md border border-line-2 bg-field p-2 text-cyan-300">
                        <IconFileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="text-xs text-mut-2">
                          {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt)}
                        </p>
                      </div>
                      <Badge tone={level.tone}>{level.label}</Badge>
                      <a
                        href={`/api/documents/${d.id}/download`}
                        className="btn btn-ghost btn-sm"
                        title="Download"
                      >
                        <IconDownload className="h-3.5 w-3.5" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="card p-5 anim-rise-2">
            <h2 className="font-display text-sm font-semibold">Details</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-mut-2">Assigned Investigator</dt>
                <dd className="text-right">
                  <p className="font-semibold">{owner?.fullName ?? "Unknown"}</p>
                  {owner && (
                    <p className="text-xs text-mut-2">
                      {ROLE_META[owner.role]?.label ?? owner.role}
                    </p>
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mut-2">Created</dt>
                <dd className="font-medium">{formatDateTime(caseRow.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mut-2">Last updated</dt>
                <dd className="font-medium">{formatDateTime(caseRow.updatedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-mut-2">Documents</dt>
                <dd className="font-medium">{docs.length}</dd>
              </div>
            </dl>
          </div>

          <div className="card p-5 anim-rise-3">
            <h2 className="font-display text-sm font-semibold">Case activity</h2>
            {activity.length === 0 ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-mut-2">
                <IconFolder className="h-4 w-4" /> No recorded activity yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {activity.map((a) => (
                  <li key={a.id} className="border-l-2 border-line-2 pl-3">
                    <p className="text-[13px]">
                      <span className="font-semibold">{a.username ?? "System"}</span>{" "}
                      <span className="text-mut">{(ACTION_LABELS[a.action] ?? a.action).toLowerCase()}</span>
                    </p>
                    {a.detail && <p className="mt-0.5 truncate text-xs text-mut-2">{a.detail}</p>}
                    <p className="mt-0.5 text-[11px] text-mut-2">{formatDateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
