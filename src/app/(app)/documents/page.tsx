// Documents — server component resolves what THIS user may see (see
// src/lib/visibility.ts) and hands a filtered, share-annotated list to the
// interactive client table. Raw file bytes are never sent here — they are
// streamed on demand via /preview and /download, which re-check access.

import type { Metadata } from "next";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cases, documentShares, documents, users } from "@/db/schema";
import { can, requireUser } from "@/lib/auth";
import { visibleCaseIds, visibleDocumentIds } from "@/lib/visibility";
import DocumentsClient, { type DocRow } from "@/components/documents-client";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const { user } = await requireUser();

  const caseVis = await visibleCaseIds(user);
  const docVis = await visibleDocumentIds(user);

  // Cases the user can filter by (= cases they can see).
  const caseRows = await db
    .select()
    .from(cases)
    .where(caseVis.all ? undefined : inArray(cases.id, caseVis.ids))
    .orderBy(cases.caseNumber);

  // Documents within this user's access level. `content` (raw bytes) is
  // intentionally excluded from what the client component receives.
  const docs =
    docVis.all || docVis.ids.length > 0
      ? await db
          .select()
          .from(documents)
          .where(docVis.all ? undefined : inArray(documents.id, docVis.ids))
          .orderBy(desc(documents.createdAt))
          .limit(300)
      : [];

  // Who is each visible document shared with? (powers the "Shared" UI)
  const shareRows =
    docs.length > 0
      ? await db
          .select({
            documentId: documentShares.documentId,
            userId: users.id,
            username: users.username,
          })
          .from(documentShares)
          .innerJoin(users, eq(documentShares.userId, users.id))
          .where(inArray(documentShares.documentId, docs.map((d) => d.id)))
      : [];
  const sharesByDoc = new Map<number, { id: number; name: string }[]>();
  for (const s of shareRows) {
    const list = sharesByDoc.get(s.documentId) ?? [];
    list.push({ id: s.userId, name: s.username });
    sharesByDoc.set(s.documentId, list);
  }

  const userRows = await db
    .select({ id: users.id, username: users.username, fullName: users.fullName })
    .from(users)
    .where(eq(users.status, "active"));

  const caseMap = new Map(caseRows.map((c) => [c.id, c]));
  const uploaderMap = new Map(userRows.map((u) => [u.id, u]));

  const rows: DocRow[] = docs.map((d) => ({
    id: d.id,
    caseId: d.caseId,
    caseNumber: caseMap.get(d.caseId)?.caseNumber ?? "—",
    caseTitle: caseMap.get(d.caseId)?.title ?? "Unknown case",
    name: d.name,
    originalName: d.originalName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    securityLevel: d.securityLevel,
    description: d.description,
    uploader: uploaderMap.get(d.uploadedBy ?? -1)?.fullName ?? "Unknown",
    uploaderId: d.uploadedBy ?? -1,
    shares: sharesByDoc.get(d.id) ?? [],
    createdAt: d.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Documents"
        sub={
          user.role === "viewer"
            ? "Documents explicitly shared with you. Ask an investigator or administrator to share more."
            : "Documents within your access level, with classification and share status."
        }
      />
      <DocumentsClient
        docs={rows}
        cases={caseRows.map((c) => ({ id: c.id, caseNumber: c.caseNumber, title: c.title }))}
        users={userRows}
        canUpload={can(user.role, "upload")}
        canDelete={can(user.role, "deleteDocument")}
        canShare={can(user.role, "shareDocument")}
      />
    </>
  );
}
