// ---------------------------------------------------------------------------
// Development bootstrap — keeps the demo always log-in-able.
//
// Why this exists: in a development sandbox the database can be rebuilt
// (or start empty) between sessions. Without this, the demo accounts would
// silently disappear and sign-in would be impossible until someone ran the
// manual seed script.
//
// What it does (idempotent — safe to run on every login/register request):
//   1. ensureCoreSchema()  — CREATE TABLE IF NOT EXISTS for every table the
//      app needs, matching src/db/schema.ts exactly. No-op when the tables
//      already exist (e.g. after `npx drizzle-kit push`).
//   2. ensureDemoUsers()   — if (and only if) the users table is EMPTY,
//      inserts the five demo accounts with bcrypt-hashed passwords.
//
// Guarantees:
//   * Never creates duplicates — guarded by the table being empty AND by the
//     UNIQUE constraint on username/email.
//   * Never modifies or resets existing accounts (including ones created
//     through the Register page) — it only fills a completely empty DB.
//   * Passwords are stored as bcrypt hashes only; plaintext exists for the
//     few milliseconds of the hash call, never in the database.
//   * A failure here is logged but never blocks the login route itself.
//
// This is a development convenience, NOT a production provisioning system.
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { auditLogs, cases, documentShares, documents, securityAlerts, users } from "@/db/schema";
import {
  DEMO_ALERTS,
  DEMO_AUDIT,
  DEMO_CASES,
  DEMO_DOCS,
  DEMO_SHARES,
  DEMO_USERS,
  UA_BROWSER_DEFAULT,
  makePdf,
} from "./demo-data";
import { encryptBuffer } from "./encryption";
import { computeSha256 } from "./files";

// DDL mirrors src/db/schema.ts (column names, types, defaults, keys).
const CORE_TABLES = [
  `create table if not exists users (
     id serial primary key,
     username text not null unique,
     email text not null unique,
     password_hash text not null,
     full_name text not null,
     role text not null default 'viewer',
     status text not null default 'active',
     notify_security boolean not null default true,
     notify_digest boolean not null default false,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists sessions (
     id text primary key,
     user_id integer not null references users(id) on delete cascade,
     ip_address text,
     created_at timestamptz not null default now(),
     expires_at timestamptz not null
   )`,
  `create table if not exists cases (
     id serial primary key,
     case_number text not null unique,
     title text not null,
     description text,
     category text not null default 'Cyber Crime',
     status text not null default 'open',
     priority text not null default 'medium',
     owner_id integer not null references users(id),
     created_by integer references users(id),
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists documents (
     id serial primary key,
     case_id integer not null references cases(id) on delete cascade,
     name text not null,
     original_name text not null,
     storage_name text not null,
     sha256_hash text not null,
     mime_type text not null,
     size_bytes integer not null,
     security_level text not null default 'confidential',
     description text,
     content bytea not null,
     uploaded_by integer references users(id),
     created_at timestamptz not null default now()
   )`,
  `create table if not exists document_shares (
     id serial primary key,
     document_id integer not null references documents(id) on delete cascade,
     user_id integer not null references users(id) on delete cascade,
     shared_by integer references users(id),
     created_at timestamptz not null default now()
   )`,
  `create table if not exists audit_logs (
     id serial primary key,
     user_id integer references users(id),
     username text,
     action text not null,
     resource_type text,
     resource_id text,
     detail text,
     ip_address text,
     user_agent text,
     success boolean not null default true,
     created_at timestamptz not null default now()
   )`,
  `create table if not exists security_alerts (
     id serial primary key,
     type text not null,
     severity text not null,
     title text not null,
     message text,
     user_id integer references users(id),
     ip_address text,
     resource_type text,
     resource_id text,
     status text not null default 'new',
     created_at timestamptz not null default now()
   )`,
  `create table if not exists document_analyses (
     id serial primary key,
     document_id integer not null references documents(id) on delete cascade,
     status text not null default 'pending',
     category text,
     summary text,
     keywords text[],
     provider text,
     error text,
     processed_at timestamptz,
     created_at timestamptz not null default now()
   )`,
];

async function ensureCoreSchema(): Promise<void> {
  for (const ddl of CORE_TABLES) {
    await db.execute(sql.raw(ddl));
  }
}

async function ensureDemoUsers(): Promise<void> {
  // Only ever acts on a completely empty users table — never touches
  // existing accounts (registered or demo), so no duplicates, ever.
  const result = (await db.execute(sql`select count(*)::int as n from users`)) as unknown as {
    rows: { n: number }[];
  };
  const n = Number(result.rows?.[0]?.n ?? 0);
  if (n > 0) return;

  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await db.insert(users).values({
      username: u.username,
      email: u.email,
      passwordHash,
      fullName: u.fullName,
      role: u.role,
      status: "active",
    });
  }
}

async function tableEmpty(table: { id: unknown }): Promise<boolean> {
  const result = (await db.execute(sql`select exists(select 1 from ${table}) as e`)) as unknown as {
    rows: { e: boolean }[];
  };
  return !result.rows?.[0]?.e;
}

// Create the full demo workspace (cases, ENCRYPTED documents, shares,
// alerts + their paired alert_created audit rows, and the audit history)
// when the cases table is empty. Guarded exactly like the users bootstrap:
// only acts on an empty workspace, never creates duplicates, never touches
// data created through the app.
async function ensureDemoCaseData(): Promise<void> {
  const result = (await db.execute(sql`select exists(select 1 from cases) as e`)) as unknown as {
    rows: { e: boolean }[];
  };
  if (result.rows?.[0]?.e) return; // workspace already has data — leave it alone

  const userRows = await db.select().from(users);
  const uid = new Map(userRows.map((u) => [u.username, u.id]));
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000);

  // Cases
  const caseIds = new Map<string, number>();
  for (const c of DEMO_CASES) {
    const at = ago(c.h);
    const [row] = await db
      .insert(cases)
      .values({
        caseNumber: c.n,
        title: c.t,
        description: c.d,
        category: c.c,
        status: c.s,
        priority: c.p,
        ownerId: uid.get(c.owner) ?? 0,
        createdBy: uid.get(c.by) ?? null,
        createdAt: at,
        updatedAt: at,
      })
      .returning({ id: cases.id });
    if (row) caseIds.set(c.n, row.id);
  }

  // Documents — encrypted + hashed exactly like real uploads
  const docIds = new Map<string, number>();
  for (const d of DEMO_DOCS) {
    const body = d.pdf ? makePdf(d.pdf.title, d.pdf.lines) : Buffer.from(d.body ?? "", "utf8");
    const ext = d.name.split(".").pop() ?? "bin";
    const [row] = await db
      .insert(documents)
      .values({
        caseId: caseIds.get(d.c) ?? 0,
        name: d.name,
        originalName: d.name,
        storageName: `${randomBytes(16).toString("hex")}.${ext}`,
        sha256Hash: computeSha256(body),
        mimeType: d.mime,
        sizeBytes: body.length,
        securityLevel: d.level,
        content: encryptBuffer(body),
        uploadedBy: uid.get(d.by) ?? null,
        createdAt: ago(d.h),
      })
      .returning({ id: documents.id });
    if (row) docIds.set(d.name, row.id);
  }

  // Shares
  for (const s of DEMO_SHARES) {
    await db.insert(documentShares).values({
      documentId: docIds.get(s.doc) ?? 0,
      userId: uid.get(s.to) ?? 0,
      sharedBy: uid.get(s.by) ?? null,
      createdAt: ago(s.h),
    });
  }

  // Alerts, each paired with its alert_created audit row (the live system
  // does this automatically — the seed history matches).
  const alertIds = new Map<string, number>();
  for (const a of DEMO_ALERTS) {
    const rid = a.ridDoc ? String(docIds.get(a.ridDoc) ?? "") : a.ridUser ? String(uid.get(a.ridUser) ?? "") : null;
    const [row] = await db
      .insert(securityAlerts)
      .values({
        type: a.t,
        severity: a.s,
        title: a.title,
        message: a.msg,
        userId: a.u ? uid.get(a.u) ?? null : null,
        ipAddress: a.ip,
        resourceType: a.rt ?? null,
        resourceId: rid,
        status: a.st,
        createdAt: ago(a.h),
      })
      .returning({ id: securityAlerts.id });
    if (row) {
      alertIds.set(a.t, row.id);
      await db.insert(auditLogs).values({
        userId: a.u ? uid.get(a.u) ?? null : null,
        username: a.u ?? null,
        action: "alert_created",
        resourceType: "alert",
        resourceId: String(row.id),
        detail: `Alert raised: ${a.title}`,
        ipAddress: a.ip,
        userAgent: UA_BROWSER_DEFAULT,
        success: true,
        createdAt: ago(a.h),
      });
    }
  }

  // Audit history
  for (const l of DEMO_AUDIT) {
    const rid = l.ridCase
      ? String(caseIds.get(l.ridCase) ?? "")
      : l.ridDoc
        ? String(docIds.get(l.ridDoc) ?? "")
        : l.ridAlert
          ? String(alertIds.get(l.ridAlert) ?? "")
          : null;
    await db.insert(auditLogs).values({
      userId: l.u ? uid.get(l.u) ?? null : null,
      username: l.u ?? null,
      action: l.a,
      resourceType: l.rt ?? null,
      resourceId: rid,
      detail: l.d,
      ipAddress: l.ip ?? "127.0.0.1",
      userAgent: l.ua ?? UA_BROWSER_DEFAULT,
      success: l.s ?? true,
      createdAt: ago(l.h),
    });
  }
}

// Called from the health endpoint (server start) and the login/register
// routes. Cached per process so the checks happen once, not per request.
let cached = false;
export async function ensureDevData(): Promise<void> {
  if (cached) return;
  try {
    await ensureCoreSchema();
    await ensureDemoUsers();
    await ensureDemoCaseData();
    cached = true;
  } catch (err) {
    // Log and continue — the login route must still respond (it will simply
    // report an auth error if the DB is genuinely unavailable).
    console.error("Dev bootstrap failed:", err);
  }
}
