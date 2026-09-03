// ---------------------------------------------------------------------------
// Visibility rules — the single source of truth for "who can see what".
//
// Two related but DISTINCT concepts:
//
//  1. CASE visibility — which case records (and detail pages) the user may
//     open.
//  2. DOCUMENT visibility — which file bytes may actually be viewed or
//     downloaded.
//
// Opening a case does NOT grant access to every file inside it: a user who
// reaches a case only through one shared document sees that document, not
// the rest of the case.
//
//   Administrator — everything, obviously.
//   Investigator  — assigned cases (owner or creator) are fully visible,
//                   plus any document shared with them.
//   Legal Officer — same read-only rules.
//   Viewer        — ONLY explicitly shared documents (and the cases those
//                   documents belong to, for orientation).
//
// Every page and API route must go through these helpers so the UI can
// never show more than the server will serve.
// ---------------------------------------------------------------------------

import { eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { cases, documentShares, documents } from "@/db/schema";
import type { SessionUser } from "./auth";

type VisibilityUser = Pick<SessionUser, "id" | "role">;

/** Ids of documents explicitly shared with a user. */
export async function sharedDocumentIds(userId: number): Promise<number[]> {
  const rows = await db
    .select({ id: documents.id })
    .from(documentShares)
    .innerJoin(documents, eq(documentShares.documentId, documents.id))
    .where(eq(documentShares.userId, userId));
  return rows.map((r) => r.id);
}

/**
 * Cases the user is directly "in": assigned to them (owner) or created by
 * them. This is what grants full document access inside a case. Returns
 * null for admins (meaning "no restriction").
 */
async function assignedCaseIds(user: VisibilityUser): Promise<number[] | null> {
  if (user.role === "administrator") return null;
  const rows = await db
    .select({ id: cases.id })
    .from(cases)
    .where(or(eq(cases.ownerId, user.id), eq(cases.createdBy, user.id)));
  return rows.map((r) => r.id);
}

/** Case records the user may list / open (case metadata + detail page). */
export async function visibleCaseIds(user: VisibilityUser): Promise<{ all: boolean; ids: number[] }> {
  if (user.role === "administrator") return { all: true, ids: [] };

  if (user.role === "viewer") {
    // A viewer's case list = the cases of their shared documents.
    const shared = await sharedDocumentIds(user.id);
    const rows =
      shared.length > 0
        ? await db.select({ caseId: documents.caseId }).from(documents).where(inArray(documents.id, shared))
        : [];
    return { all: false, ids: [...new Set(rows.map((r) => r.caseId))] };
  }

  // Investigators / legal officers: assigned or created cases, plus the
  // cases of shared documents (so a shared file can be opened inside its
  // case — without exposing the case's other files, see document rules).
  const assigned = (await assignedCaseIds(user)) ?? [];
  const shared = await sharedDocumentIds(user.id);
  const sharedCases =
    shared.length > 0
      ? (await db.select({ caseId: documents.caseId }).from(documents).where(inArray(documents.id, shared))).map((r) => r.caseId)
      : [];
  return { all: false, ids: [...new Set([...assigned, ...sharedCases])] };
}

/** Document bytes the user may view / preview / download. */
export async function visibleDocumentIds(user: VisibilityUser): Promise<{ all: boolean; ids: number[] }> {
  if (user.role === "administrator") return { all: true, ids: [] };

  // Viewers never inherit access from a case a shared document lives in —
  // their document set is exactly their explicit shares.
  if (user.role === "viewer") {
    const shared = await sharedDocumentIds(user.id);
    return { all: false, ids: shared };
  }

  // Investigators / legal officers: every document in cases they are
  // assigned to or created, plus their explicit shares.
  const assigned = (await assignedCaseIds(user)) ?? [];
  const caseDocs =
    assigned.length > 0
      ? (await db.select({ id: documents.id }).from(documents).where(inArray(documents.caseId, assigned))).map((r) => r.id)
      : [];
  const shared = await sharedDocumentIds(user.id);
  return { all: false, ids: [...new Set([...caseDocs, ...shared])] };
}

// Point check used by the preview / download / delete API routes.
// This is what stops someone from typing an unknown document URL and
// reading a file they were never given access to.
export async function canAccessDocument(
  user: VisibilityUser,
  doc: { id: number; caseId: number },
): Promise<boolean> {
  if (user.role === "administrator") return true;
  const shared = await sharedDocumentIds(user.id);
  if (shared.includes(doc.id)) return true;
  // Otherwise the document is reachable only through a case the user is
  // directly assigned to / created — NOT through a case they can merely
  // open via one shared file.
  const assigned = (await assignedCaseIds(user)) ?? [];
  return assigned.includes(doc.caseId);
}
