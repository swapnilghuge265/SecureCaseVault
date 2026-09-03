// Cases dashboard — the case register filtered by what THIS user may open:
//   admin           → all cases
//   investigator    → assigned to them (owner) or created by them
//   legal officer   → created by them or containing shared documents
//   viewer          → cases of documents explicitly shared with them
//
// The user↔case relationships (owner_id, created_by → users) are what power
// the "assigned" rules, plus the document_shares table for viewers.

import type { Metadata } from "next";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cases, documents, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { visibleCaseIds, visibleDocumentIds } from "@/lib/visibility";
import CasesClient, { type CaseRow } from "@/components/cases-client";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Cases" };

export default async function CasesPage() {
  const { user } = await requireUser();

  const caseVis = await visibleCaseIds(user);
  const docVis = await visibleDocumentIds(user);

  const [caseRows, userRows, visibleDocs] = await Promise.all([
    db
      .select()
      .from(cases)
      .where(caseVis.all ? undefined : inArray(cases.id, caseVis.ids))
      .orderBy(desc(cases.updatedAt)),
    db.select({ id: users.id, fullName: users.fullName, role: users.role, status: users.status }).from(users),
    db
      .select({ caseId: documents.caseId })
      .from(documents)
      .where(docVis.all ? undefined : inArray(documents.id, docVis.ids)),
  ]);

  // Only active investigator-role accounts may be assigned to cases.
  const investigators = userRows
    .filter((u) => u.role === "investigator" && u.status === "active")
    .map((u) => ({ id: u.id, fullName: u.fullName }));

  const userMap = new Map(userRows.map((u) => [u.id, u.fullName]));

  // Count only the documents this user can actually see per case.
  const countMap = new Map<number, number>();
  for (const d of visibleDocs) countMap.set(d.caseId, (countMap.get(d.caseId) ?? 0) + 1);

  const rows: CaseRow[] = caseRows.map((c) => ({
    id: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    category: c.category,
    status: c.status,
    priority: c.priority,
    ownerId: c.ownerId,
    ownerName: userMap.get(c.ownerId) ?? "Unknown",
    docCount: countMap.get(c.id) ?? 0,
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Cases"
        sub={
          user.role === "viewer"
            ? "Cases that have documents shared with you."
            : user.role === "legal_officer"
              ? "Your cases — read-only. Ask an investigator to share documents to collaborate."
              : "All case fields, assignments and status at a glance."
        }
      />
      <CasesClient
        cases={rows}
        investigators={investigators}
        canCreate={can(user.role, "createCase")}
        canUpdate={can(user.role, "updateCase")}
        canDelete={can(user.role, "deleteCase")}
      />
    </>
  );
}
