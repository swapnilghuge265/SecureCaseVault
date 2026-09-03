// ---------------------------------------------------------------------------
// Encryption-at-rest service (SERVER-SIDE ONLY — never import this from a
// client component; the key must not reach the browser).
//
// The three security mechanisms and their separate jobs:
//
//   1. AUTHENTICATION  — proves who the user is (bcrypt password check at
//      login, session tokens per request).
//   2. AUTHORIZATION   — decides what that user may access (role matrix in
//      lib/auth.ts + visibility rules in lib/visibility.ts). Every read of a
//      file happens AFTER both checks succeed.
//   3. ENCRYPTION      — protects CONFIDENTIALITY of the stored bytes. Even
//      someone with direct database access sees only ciphertext.
//
// SHA-256 (see lib/files.ts) is a separate, fourth mechanism: INTEGRITY.
// It verifies a document has not been altered. Hashing is NOT encryption —
// it cannot be reversed, and it reveals nothing by itself.
//
// Mechanism: AES-256-GCM — authenticated encryption with associated data
// (AEAD). This is the Node equivalent of Fernet from the original Python
// plan: it combines confidentiality with authenticity, so tampered
// ciphertext fails authentication instead of silently decrypting to junk.
//
// Key management (resolution order):
//   1. SCV_ENCRYPTION_KEY environment variable — 64 hex characters (32
//      bytes). The correct setting for every real deployment. Generate one
//      with:  node scripts/generate-key.mjs
//   2. Persisted development key file (data/dev-encryption.key, mode 0600,
//      outside any web-served directory) — created automatically on first
//      use. The hosted development sandbox rewrites .env between sessions,
//      which wipes the env key and would make every stored document
//      undecryptable; the file keeps the demo stable across resets.
//   The key is NEVER hard-coded, NEVER stored in the database, and NEVER
//   sent to the frontend. Key rotation caveat: if the key changes, files
//   encrypted with the old key can no longer be decrypted — decryption then
//   fails safely with a generic error (nothing is ever leaked about the key).
//
// Stored format (single buffer per document):
//   [0..3]   "SCV1"             format magic
//   [4..15]  12-byte random nonce (fresh for every file)
//   [16..]   ciphertext + 16-byte GCM authentication tag
// ---------------------------------------------------------------------------

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ALGORITHM = "aes-256-gcm";
const MAGIC = Buffer.from("SCV1", "ascii");
const NONCE_LEN = 12;
const TAG_LEN = 16;

export class EncryptionError extends Error {}

// Development key file — project-local, OUTSIDE any web-served directory
// (only public/ is served), created with 0600 permissions.
const DEV_KEY_FILE = path.join(process.cwd(), "data", "dev-encryption.key");

const isValidKey = (hex: string) => /^[0-9a-fA-F]{64}$/.test(hex);

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  // 1) Environment variable first (real deployments). An invalid value is a
  //    hard configuration error — fail loudly, never silently.
  const env = process.env.SCV_ENCRYPTION_KEY;
  if (env) {
    if (!isValidKey(env.trim())) {
      throw new EncryptionError("SCV_ENCRYPTION_KEY must be 64 hex characters (32 bytes).");
    }
    cachedKey = Buffer.from(env.trim(), "hex");
    return cachedKey;
  }

  // 2) Persisted development key (survives the sandbox rewriting .env).
  try {
    if (existsSync(DEV_KEY_FILE)) {
      const fileKey = readFileSync(DEV_KEY_FILE, "utf8").trim();
      if (isValidKey(fileKey)) {
        cachedKey = Buffer.from(fileKey, "hex");
        return cachedKey;
      }
    }
  } catch {
    // Unreadable/invalid file — fall through and generate a fresh key.
  }

  // 3) First use: generate, persist, and warn.
  const generated = randomBytes(32).toString("hex");
  try {
    mkdirSync(path.dirname(DEV_KEY_FILE), { recursive: true });
    writeFileSync(DEV_KEY_FILE, generated + "\n", { mode: 0o600 });
  } catch {
    throw new EncryptionError(
      "Document encryption is not configured (SCV_ENCRYPTION_KEY missing) and the development key could not be persisted.",
    );
  }
  console.warn(
    "[encryption] SCV_ENCRYPTION_KEY is not set. A development key was generated and saved to data/dev-encryption.key so demo data stays decryptable. For real deployments, set SCV_ENCRYPTION_KEY in the environment instead.",
  );
  cachedKey = Buffer.from(generated, "hex");
  return cachedKey;
}

/**
 * Encrypt a plaintext buffer for storage.
 * A fresh random nonce is generated per file, so identical documents
 * produce different ciphertexts.
 */
export function encryptBuffer(plaintext: Buffer): Buffer {
  const key = getKey(); // throws a descriptive error when misconfigured
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, nonce, encrypted, tag]);
}

/**
 * Decrypt a stored buffer back to plaintext.
 *
 * GCM authentication guarantees: wrong key, truncated data or a single
 * tampered byte all make decipher.final() throw — we catch everything and
 * surface one generic, safe error (no key material or internal details).
 */
export function decryptBuffer(stored: Buffer): Buffer {
  try {
    const key = getKey();
    const minLen = MAGIC.length + NONCE_LEN + TAG_LEN;
    if (stored.length < minLen || !stored.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("not an encrypted document");
    }
    const nonce = stored.subarray(MAGIC.length, MAGIC.length + NONCE_LEN);
    const tag = stored.subarray(stored.length - TAG_LEN);
    const ciphertext = stored.subarray(MAGIC.length + NONCE_LEN, stored.length - TAG_LEN);

    const decipher = createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Safe by design: bad key, tampered bytes, or a legacy unencrypted row
    // all produce the same generic error.
    throw new EncryptionError("Unable to decrypt this document.");
  }
}
