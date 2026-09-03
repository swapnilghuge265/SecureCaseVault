// ---------------------------------------------------------------------------
// SecureCaseVault — demo data seeder (plain Node, no build step)
//
//   node --experimental-strip-types scripts/seed.mjs
//
// The demo content comes from src/lib/demo-data.ts — the SAME module the
// running app uses to auto-initialize the dev workspace, so the two can
// never drift apart.
//
// Idempotent: if the users table is not empty it exits without changes.
// Creates the 5 demo accounts, 5 cases, 11 documents (incl. a real PDF,
// stored ENCRYPTED exactly like real uploads), shares, 4 security alerts
// (each paired with an alert_created audit row) and the audit history.
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, readFileSync as readFileSyncFs, writeFileSync } from "node:fs";
import path from "node:path";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import pg from "pg";
import bcrypt from "bcryptjs";
import {
  DEMO_ALERTS,
  DEMO_AUDIT,
  DEMO_CASES,
  DEMO_DOCS,
  DEMO_SHARES,
  DEMO_USERS,
  UA_BROWSER_DEFAULT,
  makePdf,
} from "../src/lib/demo-data.ts";

// --- Env vars: use the environment, otherwise read them from .env ----------
const envText = process.env.DATABASE_URL
  ? ""
  : readFileSync(new URL("../.env", import.meta.url), "utf8");
const envValue = (name) =>
  process.env[name] ?? envText.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");

const url = envValue("DATABASE_URL");
if (!url) throw new Error("DATABASE_URL not found in environment or .env");

// SAME key resolution as src/lib/encryption.ts:
//   1. SCV_ENCRYPTION_KEY (environment / .env) — the real-deployment setting
//   2. persisted development key file (data/dev-encryption.key) — survives
//      the sandbox resetting .env between sessions
const isValidKey = (k) => typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k);
const DEV_KEY_FILE = path.join(process.cwd(), "data", "dev-encryption.key");
function resolveEncryptionKey() {
  const env = envValue("SCV_ENCRYPTION_KEY");
  if (isValidKey(env)) return env;
  if (existsSync(DEV_KEY_FILE)) {
    const fileKey = readFileSyncFs(DEV_KEY_FILE, "utf8").trim();
    if (isValidKey(fileKey)) return fileKey;
  }
  const generated = randomBytes(32).toString("hex");
  mkdirSync(path.dirname(DEV_KEY_FILE), { recursive: true });
  writeFileSync(DEV_KEY_FILE, generated + "\n", { mode: 0o600 });
  console.log("Generated development encryption key -> data/dev-encryption.key");
  return generated;
}
// Seed files are stored encrypted exactly like real uploads.
const encKey = resolveEncryptionKey();

const client = new pg.Client({ connectionString: url });

const ago = (hours) => new Date(Date.now() - hours * 3_600_000);

// AES-256-GCM with the app's stored format: "SCV1" + 12-byte nonce +
// ciphertext + 16-byte auth tag (identical to src/lib/encryption.ts).
function encryptFile(plain) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(encKey, "hex"), nonce);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from("SCV1", "ascii"), nonce, enc, cipher.getAuthTag()]);
}

try {
  await client.connect();

  // --- Skip if data already exists ------------------------------------------
  const { rows } = await client.query("select count(*)::int as n from users");
  if (rows[0].n > 0) {
    console.log("Seed skipped: users already exist. Delete the database rows to reseed.");
    process.exit(0);
  }

  // --- Append-only guard on audit_logs --------------------------------------
  await client.query(`
    create or replace function audit_logs_append_only() returns trigger as $fn$
    begin
      raise exception 'audit_logs is append-only: % is not allowed', tg_op;
    end
    $fn$ language plpgsql`);
  await client.query(`
    drop trigger if exists audit_logs_no_update on audit_logs;
    create trigger audit_logs_no_update
    before update on audit_logs
    for each row execute function audit_logs_append_only()`);
  await client.query(`
    drop trigger if exists audit_logs_no_delete on audit_logs;
    create trigger audit_logs_no_delete
    before delete on audit_logs
    for each row execute function audit_logs_append_only()`);

  await client.query("begin");

  // --- Users -----------------------------------------------------------------
  const userId = {};
  for (const u of DEMO_USERS) {
    const passwordHash = bcrypt.hashSync(u.password, 10);
    const res = await client.query(
      `insert into users (username, email, password_hash, full_name, role, status, created_at)
       values ($1, $2, $3, $4, $5, 'active', $6) returning id`,
      [u.username, u.email, passwordHash, u.fullName, u.role, ago(u.h)],
    );
    userId[u.username] = res.rows[0].id;
  }

  // --- Cases -------------------------------------------------------------------
  const caseId = {};
  for (const c of DEMO_CASES) {
    const res = await client.query(
      `insert into cases (case_number, title, description, category, status, priority, owner_id, created_by, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) returning id`,
      [c.n, c.t, c.d, c.c, c.s, c.p, userId[c.owner], userId[c.by], ago(c.h)],
    );
    caseId[c.n] = res.rows[0].id;
  }

  // --- Documents (encrypted, hashed, secure storage names) ---------------------
  const docIdByName = {};
  for (const d of DEMO_DOCS) {
    const body = d.pdf ? makePdf(d.pdf.title, d.pdf.lines) : Buffer.from(d.body ?? "", "utf8");
    const ext = d.name.split(".").pop();
    const storageName = `${randomBytes(16).toString("hex")}.${ext}`;
    const sha256 = createHash("sha256").update(body).digest("hex");
    const res = await client.query(
      `insert into documents (case_id, name, original_name, storage_name, sha256_hash, mime_type, size_bytes, security_level, description, content, uploaded_by, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, null, $9, $10, $11) returning id`,
      [caseId[d.c], d.name, d.name, storageName, sha256, d.mime, body.length, d.level, encryptFile(body), userId[d.by], ago(d.h)],
    );
    docIdByName[d.name] = res.rows[0].id;
  }

  // --- Shares --------------------------------------------------------------------
  for (const s of DEMO_SHARES) {
    await client.query(
      `insert into document_shares (document_id, user_id, shared_by, created_at)
       values ($1, $2, $3, $4)`,
      [docIdByName[s.doc], userId[s.to], userId[s.by], ago(s.h)],
    );
  }

  // --- Alerts (each paired with an alert_created audit row) ----------------------
  const alertId = {};
  for (const a of DEMO_ALERTS) {
    const rid = a.ridDoc ? String(docIdByName[a.ridDoc]) : a.ridUser ? String(userId[a.ridUser]) : null;
    const res = await client.query(
      `insert into security_alerts (type, severity, title, message, user_id, ip_address, resource_type, resource_id, status, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [a.t, a.s, a.title, a.msg, a.u ? userId[a.u] : null, a.ip, a.rt ?? null, rid, a.st, ago(a.h)],
    );
    alertId[a.t] = res.rows[0].id;
    await client.query(
      `insert into audit_logs (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, success, created_at)
       values ($1, $2, 'alert_created', 'alert', $3, $4, $5, $6, true, $7)`,
      [a.u ? userId[a.u] : null, a.u ?? null, String(res.rows[0].id), `Alert raised: ${a.title}`, a.ip, UA_BROWSER_DEFAULT, ago(a.h)],
    );
  }

  // --- Audit history ----------------------------------------------------------------
  for (const l of DEMO_AUDIT) {
    const rid = l.ridCase
      ? String(caseId[l.ridCase])
      : l.ridDoc
        ? String(docIdByName[l.ridDoc])
        : l.ridAlert
          ? String(alertId[l.ridAlert])
          : null;
    await client.query(
      `insert into audit_logs (user_id, username, action, resource_type, resource_id, detail, ip_address, user_agent, success, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        l.u ? userId[l.u] : null,
        l.u ?? null,
        l.a,
        l.rt ?? null,
        rid,
        l.d,
        l.ip ?? "127.0.0.1",
        l.ua ?? UA_BROWSER_DEFAULT,
        l.s ?? true,
        ago(l.h),
      ],
    );
  }

  await client.query("commit");
  console.log("Seed complete:");
  console.log("  5 users   (admin / 2 investigators / legal / viewer)");
  console.log("  5 cases   (SCV-2026-0001 .. 0005)");
  console.log("  11 documents (encrypted at rest, incl. a real PDF)");
  console.log("  4 document shares (3 → viewer, 1 → legal)");
  console.log("  38 audit entries (append-only trigger installed), 4 security alerts");
  console.log("");
  console.log("Demo credentials:");
  console.log("  admin        / Admin@12345         (Administrator)");
  console.log("  investigator / Investigator@12345  (Investigator)");
  console.log("  s.reyes      / Investigator2@12345 (Investigator)");
  console.log("  legal        / Legal@12345         (Legal Officer)");
  console.log("  viewer       / Viewer@12345        (Viewer)");
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error("Seed failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
