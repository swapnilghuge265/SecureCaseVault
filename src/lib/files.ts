// ---------------------------------------------------------------------------
// File handling service for document uploads.
//
// Security decisions (all prototype-grade, all real):
//  * Six supported formats only (PDF, DOCX, XLSX, JPG, PNG, TXT). Anything
//    else is rejected before a single byte is stored.
//  * Uploads are capped at 10 MB and must be non-empty.
//  * The STORAGE name is a random 128-bit hex string — it is never derived
//    from user input, so a crafted file name cannot influence it.
//  * The ORIGINAL file name is sanitized before it is stored or used in
//    download headers: path separators become underscores, ".." tokens and
//    control characters are removed. That is this app's path-traversal
//    defense — the stored name can never be a directory path.
//  * File BYTES live in PostgreSQL (bytea), never in a web-served folder,
//    so uploaded files can never be fetched by guessing a URL.
//  * A SHA-256 hash is computed over the bytes at upload time and stored
//    for integrity checking. IMPORTANT: hashing is not encryption — the
//    document content itself is stored unencrypted in this prototype.
// ---------------------------------------------------------------------------

import { createHash, randomBytes } from "node:crypto";

/** Maximum upload size: 10 MB. */
export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/** Supported prototype formats (nothing else is accepted). */
export const ALLOWED_EXTENSIONS = new Set(["pdf", "docx", "xlsx", "jpg", "png", "txt"]);

export const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  png: "image/png",
  txt: "text/plain",
};

export const SUPPORTED_FORMATS_HINT = "PDF, DOCX, XLSX, JPG, PNG, TXT";

/**
 * Make a user-supplied filename safe to store and echo back in headers:
 * no path separators, no parent-directory tokens, no control characters.
 */
export function sanitizeOriginalName(name: string): string {
  const cleaned = name
    .replace(/[/\\]+/g, "_") // path separators → underscores
    .replace(/\.\./g, "_") // no ".." tokens
    .replace(/[\u0000-\u001f\u007f]/g, "") // no control characters
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 180) : "unnamed-file";
}

/** Random storage filename: 32 hex chars + the validated extension. */
export function generateStorageName(ext: string): string {
  return `${randomBytes(16).toString("hex")}.${ext}`;
}

/** SHA-256 fingerprint (integrity check, NOT encryption). */
export function computeSha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
