// GET /api/documents/:id/preview
// Secure read flow, in order:
//   1. AUTHENTICATION  — a valid session is required
//   2. AUTHORIZATION   — canAccessDocument() (role + visibility rules)
//   3. DECRYPT         — AES-256-GCM, only after both checks succeed
//   4. SEND            — plaintext streamed once, with no-store caching
//
// The database stores ciphertext only; plaintext exists in memory for the
// few milliseconds it takes to answer an authorized request.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { clientIp, requireApiUser } from "@/lib/auth";
import { canAccessDocument } from "@/lib/visibility";
import { decryptBuffer } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { checkAccessVolumeRules, logDocumentAccessDenied } from "@/lib/detection";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await params;
  const [doc] = await db.select().from(documents).where(eq(documents.id, Number(id)));
  if (!doc) return Response.json({ error: "Document not found." }, { status: 404 });

  // Authorization happens on the SERVER, not just in the UI: a user can
  // only preview files that the visibility rules allow them to see. Denied
  // attempts are audited (success=false) and fed to rule R5.
  if (!(await canAccessDocument(session.user, doc))) {
    await logDocumentAccessDenied(session.user, req, doc.name);
    return Response.json({ error: "You do not have access to this document." }, { status: 403 });
  }

  // Decrypt only for an authorized reader. Any failure (wrong key,
  // tampered bytes) returns a safe, generic 500 — never a stack trace or
  // key material.
  let plaintext: Buffer;
  try {
    plaintext = decryptBuffer(doc.content);
  } catch {
    console.error("Decryption failed for document", doc.id);
    return Response.json(
      { error: "Unable to read this document." },
      { status: 500 },
    );
  }

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "document_view",
      resourceType: "document",
      resourceId: String(doc.id),
      detail: `Viewed ${doc.name}`,
      ip: clientIp(req),
    },
    req,
  );

  // R7 — unusual access volume (25+ views within 60 minutes).
  await checkAccessVolumeRules(session.user, clientIp(req));

  return new Response(new Uint8Array(plaintext), {
    headers: {
      "Content-Type": doc.mimeType,
      "Cache-Control": "no-store",
    },
  });
}
