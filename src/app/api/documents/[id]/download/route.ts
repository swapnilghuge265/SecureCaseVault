// GET /api/documents/:id/download
// Secure download flow, in order:
//   1. AUTHENTICATION  — a valid session is required
//   2. AUTHORIZATION   — canAccessDocument() (role + visibility rules);
//                        viewer downloads of sensitive files raise alerts
//   3. DECRYPT         — AES-256-GCM, only after both checks succeed
//   4. SEND            — attachment with the sanitized original filename
//
// The filename in the header is the SANITIZED original name, percent-
// encoded (header injection / path traversal blocked). The bytes were
// stored in the database under a random storage name, encrypted — there is
// no file path anywhere in the request.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { clientIp, requireApiUser } from "@/lib/auth";
import { canAccessDocument } from "@/lib/visibility";
import { decryptBuffer } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { checkBulkDownloadRules, logDocumentAccessDenied } from "@/lib/detection";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) {
    // Browser navigations (anchor tags) should go back to the login page.
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const ip = clientIp(req);
  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, Number(id)));
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });

  // Authorize before serving bytes — this is the last line of defense if
  // a stale link or a crafted URL points at a document the user cannot
  // otherwise see (e.g. a viewer guessing document ids). Denied attempts
  // are audited (success=false) and fed to rule R5.
  if (!(await canAccessDocument(session.user, doc))) {
    await logDocumentAccessDenied(session.user, req, doc.name);
    return Response.json({ error: "You do not have access to this document." }, { status: 403 });
  }

  // Decrypt only for an authorized reader. Failures (wrong key, tampered
  // bytes) surface as one generic, safe 500.
  let plaintext: Buffer;
  try {
    plaintext = decryptBuffer(doc.content);
  } catch {
    console.error("Decryption failed for document", doc.id);
    return Response.json({ error: "Unable to read this document." }, { status: 500 });
  }

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "document_download",
      resourceType: "document",
      resourceId: String(doc.id),
      detail: `Downloaded ${doc.name}`,
      ip,
      success: true,
    },
    req,
  );

  // R4 — bulk downloads (8+ within 5 minutes by one user).
  await checkBulkDownloadRules(session.user, ip);

  // Viewers have read-only access — flag sensitive pulls for review.
  if (session.user.role === "viewer" && doc.securityLevel !== "confidential") {
    await raiseAlert(
      {
        type: "sensitive_download",
        severity: "medium",
        title: "Sensitive document downloaded by Viewer",
        message: `${session.user.username} (Viewer) downloaded ${doc.name} (${doc.securityLevel}) from case file.`,
        userId: session.user.id,
        ip,
      },
      { userId: session.user.id, username: session.user.username, ip },
    );
  }

  return new Response(new Uint8Array(plaintext), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "Cache-Control": "no-store",
    },
  });
}
