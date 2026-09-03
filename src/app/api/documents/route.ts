// POST /api/documents
// Uploads a document (multipart/form-data: caseId, name, description,
// securityLevel, file).
//
// Pipeline (see src/lib/files.ts + src/lib/encryption.ts):
//  1. authentication + role check (upload permission)
//  2. input validation: case exists, file present, non-empty, ≤ 10 MB,
//     extension in the six-format whitelist
//  3. original name sanitized (path-traversal defense), random storage
//     name generated, SHA-256 hash computed over the PLAINTEXT (integrity
//     of the logical document — kept separate from encryption)
//  4. bytes are ENCRYPTED with AES-256-GCM (confidentiality) before being
//     stored in PostgreSQL — the database holds ciphertext only
//  5. audit entry; Top Secret uploads additionally raise an alert

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, documents } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import {
  ALLOWED_EXTENSIONS,
  MIME_BY_EXT,
  MAX_UPLOAD_SIZE,
  SUPPORTED_FORMATS_HINT,
  computeSha256,
  generateStorageName,
  sanitizeOriginalName,
} from "@/lib/files";
import { EncryptionError, encryptBuffer } from "@/lib/encryption";
import { isExtractableFormat } from "@/lib/ai";
import { runDocumentAnalysis } from "@/lib/ai/process-document";
import { logPermissionDenied } from "@/lib/detection";
import { logAudit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";

const LEVELS = ["confidential", "secret", "top_secret"];

export async function POST(req: Request) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "upload")) {
    await logPermissionDenied(session.user, req, "uploading a document");
    return Response.json({ error: "Your role does not allow uploading documents." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid upload payload." }, { status: 400 });
  }

  const caseId = Number(form.get("caseId"));
  const rawDisplayName = String(form.get("name") ?? "");
  const description = String(form.get("description") ?? "").trim().slice(0, 500);
  const securityLevel = String(form.get("securityLevel") ?? "confidential");
  const file = form.get("file");

  // --- Input validation ----------------------------------------------------
  if (!Number.isInteger(caseId)) return Response.json({ error: "Please select a case." }, { status: 400 });
  if (!LEVELS.includes(securityLevel))
    return Response.json({ error: "Unknown security level." }, { status: 400 });
  if (!(file instanceof File)) return Response.json({ error: "Please choose a file to upload." }, { status: 400 });

  const [caseRow] = await db
    .select({ id: cases.id, caseNumber: cases.caseNumber })
    .from(cases)
    .where(eq(cases.id, caseId));
  if (!caseRow) return Response.json({ error: "The selected case no longer exists." }, { status: 400 });

  if (file.size === 0) return Response.json({ error: "The file is empty." }, { status: 400 });
  if (file.size > MAX_UPLOAD_SIZE)
    return Response.json({ error: "File is too large. Maximum size is 10 MB." }, { status: 400 });

  // Type check by extension — browser-sent MIME types are easily spoofed,
  // so the extension whitelist is the contract we enforce.
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext))
    return Response.json(
      { error: `File type ".${ext || "?"}" is not supported. Supported formats: ${SUPPORTED_FORMATS_HINT}.` },
      { status: 400 },
    );

  // --- Secure storage details ----------------------------------------------
  const originalName = sanitizeOriginalName(file.name);
  const storageName = generateStorageName(ext);
  const content = Buffer.from(await file.arrayBuffer());
  // Integrity fingerprint of the logical (plaintext) document. Hashing
  // verifies "has this file changed?" — it is NOT what protects it.
  const sha256Hash = computeSha256(content);
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  // Display name is optional — an empty field falls back to the (sanitized)
  // original file name.
  const displayName = rawDisplayName.trim()
    ? sanitizeOriginalName(rawDisplayName).slice(0, 180)
    : originalName;

  // Confidentiality: encrypt BEFORE anything touches the database.
  // On failure (e.g. missing key) we stop with a 500 — plaintext is never
  // stored as a fallback, and no file contents are echoed back in errors.
  let storedContent: Buffer;
  try {
    storedContent = encryptBuffer(content);
  } catch (err) {
    const message =
      err instanceof EncryptionError ? err.message : "The document could not be encrypted.";
    console.error("Encryption failed during upload", err);
    return Response.json({ error: message }, { status: 500 });
  }

  const [inserted] = await db
    .insert(documents)
    .values({
      caseId,
      name: displayName,
      originalName,
      storageName,
      sha256Hash,
      mimeType,
      sizeBytes: content.length,
      securityLevel,
      description: description || null,
      content: storedContent, // AES-256-GCM ciphertext (see lib/encryption.ts)
      uploadedBy: session.user.id,
    })
    .returning();

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "document_upload",
      resourceType: "document",
      resourceId: String(inserted.id),
      detail: `Uploaded ${displayName} to ${caseRow.caseNumber} (sha256 ${sha256Hash.slice(0, 12)}…)`,
      ip: clientIp(req),
      success: true,
    },
    req,
  );

  // Best-effort AI analysis right after upload (extractable formats only).
  // AI failures NEVER break the upload — the document is stored either way,
  // and the failure is recorded on the analysis row + audit log.
  if (isExtractableFormat(mimeType, displayName)) {
    try {
      await runDocumentAnalysis(
        { id: inserted.id, name: displayName, mimeType, content: storedContent },
        { id: session.user.id, username: session.user.username },
        clientIp(req),
      );
    } catch (err) {
      console.error("Auto AI analysis after upload failed (non-fatal)", err);
    }
  }

  // Sensitive classifications draw attention to the admin alert queue.
  if (securityLevel === "top_secret") {
    await raiseAlert(
      {
        type: "sensitive_upload",
        severity: "medium",
        title: "Top Secret document uploaded",
        message: `${displayName} was uploaded to case ${caseRow.caseNumber} with TOP SECRET classification by ${session.user.username}.`,
        userId: session.user.id,
        ip: clientIp(req),
      },
      { userId: session.user.id, username: session.user.username, ip: clientIp(req) },
    );
  }

  return Response.json({ ok: true, id: inserted.id, sha256Hash });
}
