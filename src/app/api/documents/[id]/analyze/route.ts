// POST /api/documents/:id/analyze
// "Analyze with AI" — runs the AI Document Intelligence pipeline for one
// document.
//
// Security:
//   * requires a valid session (authentication)
//   * requires document-level authorization (canAccessDocument — the same
//     rule that gates preview/download, so RBAC is unchanged)
//   * decryption happens only inside the pipeline, in memory, and the
//     plaintext buffer is zeroed afterwards
//   * failures return SAFE messages only (no content, no stack, no config)
//   * every attempt is audited:
//       ai_analysis_requested / ai_analysis_completed / ai_analysis_failed

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { canAccessDocument } from "@/lib/visibility";
import { clientIp, requireApiUser } from "@/lib/auth";
import { logPermissionDenied } from "@/lib/detection";
import { runDocumentAnalysis } from "@/lib/ai/process-document";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const docId = Number(id);
  if (!Number.isInteger(docId)) return Response.json({ error: "Invalid document id." }, { status: 400 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });

  // Authorization — only users who may access this document may analyze it.
  if (!(await canAccessDocument(session.user, doc))) {
    await logPermissionDenied(session.user, req, `analyzing document #${doc.id} they cannot access`);
    return Response.json({ error: "You do not have access to this document." }, { status: 403 });
  }

  // Processing is synchronous for the prototype (fast local analysis); the
  // pipeline itself is what a future background worker would invoke.
  const analysis = await runDocumentAnalysis(
    { id: doc.id, name: doc.name, mimeType: doc.mimeType, content: doc.content },
    { id: session.user.id, username: session.user.username },
    clientIp(req),
  );

  if (analysis.status === "failed") {
    // Safe message only — never raw provider errors or content.
    return Response.json(
      { error: analysis.error ?? "AI analysis unavailable for this document.", analysis },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, analysis });
}
