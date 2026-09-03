// DELETE /api/documents/:id
// Removes a document. Investigators and administrators can delete.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logPermissionDenied } from "@/lib/detection";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "deleteDocument")) {
    await logPermissionDenied(session.user, req, "deleting a document");
    return Response.json({ error: "Your role does not allow deleting documents." }, { status: 403 });
  }

  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, Number(id)));
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });

  await db.delete(documents).where(eq(documents.id, doc.id));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "document_delete",
      resourceType: "document",
      resourceId: String(doc.id),
      detail: `Deleted ${doc.name}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}
