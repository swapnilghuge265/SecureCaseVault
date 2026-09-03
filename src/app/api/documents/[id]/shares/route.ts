// /api/documents/:id/shares
//  POST   { userId } — explicitly share this document with a user
//  DELETE { userId } — remove a share
//
// Security decisions:
//  * Only roles with `shareDocument` (administrator, investigator) may
//    grant or revoke access.
//  * The actor must themselves be able to see the document
//    (lib/visibility.ts) — otherwise anyone could "share" files from
//    cases they have no business opening.
//  * You cannot share a document with yourself (redundant — you already
//    have access as uploader/owner).
//  * Each grant is an explicit, auditable row in document_shares, which
//    is also what the Viewer role's visibility is built on.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documentShares, documents, users } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import { canAccessDocument } from "@/lib/visibility";
import { logAudit } from "@/lib/audit";
import { logPermissionDenied } from "@/lib/detection";

async function loadDoc(idParam: string) {
  const id = Number(idParam);
  if (!Number.isInteger(id)) return null;
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  return doc ?? null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "shareDocument")) {
    await logPermissionDenied(session.user, req, "sharing a document");
    return Response.json(
      { error: "Your role does not allow sharing documents." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const doc = await loadDoc(id);
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!(await canAccessDocument(session.user, doc))) {
    await logPermissionDenied(session.user, req, `sharing document #${doc.id} they cannot see`);
    return Response.json(
      { error: "You do not have access to this document, so you cannot share it." },
      { status: 403 },
    );
  }

  let body: { userId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const userId = Number(body.userId);
  if (!Number.isInteger(userId)) return Response.json({ error: "Missing user id." }, { status: 400 });

  if (userId === session.user.id)
    return Response.json(
      { error: "You already have access to your own uploads." },
      { status: 400 },
    );

  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target) return Response.json({ error: "That user does not exist." }, { status: 400 });

  const [existing] = await db
    .select({ id: documentShares.id })
    .from(documentShares)
    .where(and(eq(documentShares.documentId, doc.id), eq(documentShares.userId, userId)));
  if (existing)
    return Response.json({ error: "This document is already shared with that user." }, { status: 409 });

  await db.insert(documentShares).values({
    documentId: doc.id,
    userId,
    sharedBy: session.user.id,
  });

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "document_share",
      resourceType: "document",
      resourceId: String(doc.id),
      detail: `Shared ${doc.name} with @${target.username}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "shareDocument")) {
    await logPermissionDenied(session.user, req, "removing a document share");
    return Response.json(
      { error: "Your role does not allow managing shares." },
      { status: 403 },
    );
  }

  const { id } = await params;
  const doc = await loadDoc(id);
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });
  if (!(await canAccessDocument(session.user, doc)))
    return Response.json(
      { error: "You do not have access to this document." },
      { status: 403 },
    );

  let body: { userId?: number };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  const userId = Number(body.userId);
  if (!Number.isInteger(userId)) return Response.json({ error: "Missing user id." }, { status: 400 });

  const [share] = await db
    .select()
    .from(documentShares)
    .where(and(eq(documentShares.documentId, doc.id), eq(documentShares.userId, userId)));
  if (!share) return Response.json({ error: "No such share exists." }, { status: 404 });

  await db.delete(documentShares).where(eq(documentShares.id, share.id));

  const [target] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "document_unshare",
      resourceType: "document",
      resourceId: String(doc.id),
      detail: `Removed @${target?.username ?? "user"}'s access to ${doc.name}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}
