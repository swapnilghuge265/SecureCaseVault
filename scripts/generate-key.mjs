// ---------------------------------------------------------------------------
// Generate a SecureCaseVault document-encryption key.
//
//   node scripts/generate-key.mjs
//
// Prints a 32-byte key as 64 hex characters. Add it to your .env file as:
//
//   SCV_ENCRYPTION_KEY=<printed value>
//
// The key lives ONLY in the environment — never in code, never in the
// database, never in the frontend. Losing the key means the stored
// documents can no longer be decrypted (that is what makes it secure).
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";

console.log(randomBytes(32).toString("hex"));
