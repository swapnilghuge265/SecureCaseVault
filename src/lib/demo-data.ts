// ---------------------------------------------------------------------------
// SINGLE SOURCE OF TRUTH for the development demo workspace.
//
// Used by BOTH:
//   * src/lib/bootstrap.ts — auto-creates the demo workspace in the running
//     server's database on startup (when the tables are empty)
//   * scripts/seed.mjs     — the manual seeder (run with
//     `node --experimental-strip-types scripts/seed.mjs`)
//
// Everything here is fictitious demo data. Passwords are stored only as
// bcrypt hashes at insertion time (never persisted in plaintext).
// ---------------------------------------------------------------------------

import { randomBytes } from "node:crypto";

const UA_BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const UA_BROWSER_DEFAULT = UA_BROWSER;

// --- Users (auto-created when the users table is empty) ----------------------
export interface DemoUser {
  username: string;
  email: string;
  fullName: string;
  role: string;
  password: string; // hashed at insert time — never stored in plain text
  h: number; // account age in hours
}

export const DEMO_USERS: DemoUser[] = [
  { username: "admin", email: "admin@securecasevault.local", fullName: "Avery Stone", role: "administrator", password: "Admin@12345", h: 45 * 24 },
  { username: "investigator", email: "ivy.chen@securecasevault.local", fullName: "Ivy Chen", role: "investigator", password: "Investigator@12345", h: 30 * 24 },
  { username: "s.reyes", email: "sofia.reyes@securecasevault.local", fullName: "Sofia Reyes", role: "investigator", password: "Investigator2@12345", h: 40 * 24 },
  { username: "legal", email: "marcus.reid@securecasevault.local", fullName: "Marcus Reid", role: "legal_officer", password: "Legal@12345", h: 21 * 24 },
  { username: "viewer", email: "noah.patel@securecasevault.local", fullName: "Noah Patel", role: "viewer", password: "Viewer@12345", h: 3 * 24 },
];

// --- Cases --------------------------------------------------------------------
export interface DemoCase {
  n: string; // case number
  t: string;
  d: string;
  c: string; // category
  s: string; // status
  p: string; // priority
  owner: string; // assigned investigator (username)
  by: string; // creator (username)
  h: number; // age in hours
}

export const DEMO_CASES: DemoCase[] = [
  { n: "SCV-2026-0001", t: "Cloud credentials misuse", c: "Cyber Crime", s: "investigating", p: "high", owner: "investigator", by: "investigator", d: "Employee service account used from unfamiliar regions to export customer data. Credential rotation in progress; access logs under review.", h: 12 * 24 },
  { n: "SCV-2026-0002", t: "Vendor invoice fraud", c: "Fraud", s: "pending", p: "medium", owner: "s.reyes", by: "legal", d: "Recurring invoice discrepancy from third-party logistics vendor. Procurement and legal coordinating on contract review; awaiting vendor response.", h: 8 * 24 },
  { n: "SCV-2026-0003", t: "Phishing campaign takedown", c: "Cyber Crime", s: "closed", p: "high", owner: "investigator", by: "admin", d: "Targeted phishing campaign impersonating payroll. Domains reported to registrar; user accounts reset. Closed after 11 days.", h: 10 * 24 },
  { n: "SCV-2026-0004", t: "Customer data exposure assessment", c: "Data Breach", s: "investigating", p: "critical", owner: "investigator", by: "investigator", h: 6 * 24, d: "Potential exposure of a customer PII export via mis-scoped API token. Scope, affected accounts and notification obligations being assessed." },
  { n: "SCV-2026-0005", t: "Legacy IP infringement review", c: "IP Dispute", s: "archived", p: "low", owner: "s.reyes", by: "legal", d: "Historic dispute over a retired product line. Archived after settlement review completed.", h: 30 * 24 },
];

// --- Documents ------------------------------------------------------------------
// Body is plaintext text, EXCEPT pdf entries (built with makePdf). Bytes are
// encrypted with AES-256-GCM at insert time, exactly like real uploads.
export interface DemoDoc {
  c: string; // case number
  name: string;
  level: string;
  mime: string;
  by: string; // uploader username
  h: number; // age in hours
  body?: string;
  pdf?: { title: string; lines: string[] };
}

export const DEMO_DOCS: DemoDoc[] = [
  { c: "SCV-2026-0004", name: "exposure-scope-assessment.txt", level: "top_secret", mime: "text/plain", by: "investigator", h: 5, body: "EXPOSURE SCOPE ASSESSMENT\n\nToken\n  Scope: read:customers:pii\n  Issued: 61 days ago, no rotation\n\nBlast radius\n  Endpoints reachable with the token: 7\n  Rows potentially exported: 48,211 (est.)\n\nNext steps\n  1. Confirm export window from gateway logs\n  2. Enumerate affected accounts\n  3. Draft regulator notification timeline\n" },
  { c: "SCV-2026-0001", name: "credential-abuse-timeline.txt", level: "confidential", mime: "text/plain", by: "investigator", h: 3, body: "CREDENTIAL ABUSE TIMELINE (UTC)\n\n02:14  first anomalous API call (fra-1)\n02:19  41 calls in 60 seconds\n02:47  bulk export endpoint hit\n03:02  MFA challenge issued, ignored\n03:11  credential rotated by on-call\n03:40  gateway logs preserved\n\nAll entries cross-checked against gateway raw logs.\n" },
  { c: "SCV-2026-0002", name: "invoice-discrepancy-log.txt", level: "confidential", mime: "text/plain", by: "legal", h: 12, body: "INVOICE DISCREPANCY LOG (csv)\ninvoice_id,date,amount,currency,flagged_by,note\nINV-9917,2026-01-08,4180.00,USD,m.reid,duplicate line item\nINV-9923,2026-01-15,2890.00,USD,m.reid,service not rendered\nINV-9940,2026-01-29,5105.50,USD,i.chen,price exceeds contract cap\nINV-9961,2026-02-06,1975.00,USD,m.reid,po missing\n" },
  { c: "SCV-2026-0004", name: "affected-accounts-summary.txt", level: "secret", mime: "text/plain", by: "investigator", h: 26, body: "AFFECTED ACCOUNTS SUMMARY (csv)\nsegment,accounts,pii_fields,notification_tier\nenterprise,121,email+phone,tier-1\nsmb,4463,email+phone,tier-2\nconsumer,43627,email,tier-3\n" },
  { c: "SCV-2026-0001", name: "access-reports-q3.txt", level: "confidential", mime: "text/plain", by: "investigator", h: 2 * 24, body: "ACCESS REPORTS Q3 (csv)\ntimestamp,account,region,endpoint,action\n2025-09-14T02:14:00Z,svc-accounts,fra-1,/api/v2/customers,GET\n2025-09-14T02:19:11Z,svc-accounts,sin-1,/api/v2/export,POST\n2025-09-14T02:47:30Z,svc-accounts,fra-1,/api/v2/customers,GET\n2025-09-14T03:02:05Z,svc-accounts,fra-1,/auth/mfa,CHALLENGE\n2025-09-14T03:11:48Z,ops-rotation,fra-1,/auth/rotate,OK\n" },
  { c: "SCV-2026-0002", name: "vendor-contract-summary.txt", level: "secret", mime: "text/plain", by: "legal", h: 4 * 24, body: "VENDOR CONTRACT SUMMARY - LOGISTICS PARTNER\n\nContract period:  01/2024 - 12/2026 (renewal clause 11.4)\nRate card:       Section 7, capped at 4,900.00 USD per month\nAudit rights:    Section 9.2, 30 days notice, 2x per year\nDispute:         Mediation first, 60 day window\n\nRelevant: invoices INV-9917 / 9923 / 9940 exceed or duplicate\ncontract line items. See discrepancy log for details.\n" },
  { c: "SCV-2026-0001", name: "witness-statement-miller.pdf", level: "secret", mime: "application/pdf", by: "investigator", h: 24, pdf: { title: "Witness Statement - D. Miller", lines: [ "Case: SCV-2026-0001  Cloud credentials misuse", "", "I am the on-call infrastructure engineer for the affected account.", "On the 4th I observed repeated API calls from two regional endpoints", "that do not correspond to any known office or office VPN range.", "I preserved the raw gateway logs before the credential rotation", "completed, and transferred them to the investigation lead.", "", "Statement given voluntarily.  (Demonstration content - fictitious.)" ] } },
  { c: "SCV-2026-0003", name: "phishing-email-samples.txt", level: "confidential", mime: "text/plain", by: "admin", h: 9 * 24, body: "SAMPLE 1 - Subject: [Payroll] Your December schedule has changed\nFrom: payroll-system <no-reply@acme-payroll-update.net>\nReply-to: helpdesk@acme-payroll-update.net\n\nNote: lookalike domain (acme-payroll-update.net vs acme-payroll.net).\nSender SPF check failed. Attached credential form (not opened).\n\nSAMPLE 2 - Subject: Urgent: reset your badge access\nSame infrastructure, different template. 14 users clicked, 3 entered\ncredentials before the banner went out at 09:42.\n" },
  { c: "SCV-2026-0003", name: "takedown-report.txt", level: "secret", mime: "text/plain", by: "admin", h: 8 * 24, body: "TAKEDOWN REPORT - PHISHING CAMPAIGN\n\n- 2 domains reported to registrar (abuse contact 09/14)\n- 1 domain seized 09/16, 1 expired unclaimed 09/21\n- Hosting provider: IP range 45.14.2x.0/24 blocked at perimeter\n- 3 affected accounts reset + MFA enforced\n- No data exfiltration confirmed from the credential form\n\nCampaign considered neutralised. Case closed 09/25.\n" },
  { c: "SCV-2026-0004", name: "breach-notification-draft.txt", level: "top_secret", mime: "text/plain", by: "legal", h: 3 * 24, body: "NOTIFICATION DRAFT - CUSTOMER DATA EXPOSURE (DRAFT v2)\n\nWhat happened\n  Between [dates], a mis-scoped API token allowed exports from the\n  customer profile service. Approximately 48,000 records are in scope.\n\nWhat we are doing\n  - Token revoked, all tokens rotated\n  - Per-account notification letters (tiered)\n  - Free credit monitoring for consumer segment\n\nLegal review status\n  Counsel review complete 2026-02-08. Awaiting scope confirmation\n  from engineering before dispatch.\n" },
  { c: "SCV-2026-0005", name: "ip-precedent-review.txt", level: "confidential", mime: "text/plain", by: "legal", h: 21 * 24, body: "IP PRECEDENT REVIEW - RETIRED PRODUCT LINE\n\nSummary of settled dispute file:\n- Claim window 2019-2021\n- Settlement: licence-back for internal use only\n- Residual obligations: none after 12/2025\n- Archive note: file closed out, retained for reference\n" },
];

// Minimal valid single-page PDF (Courier). Offsets are computed, so the
// xref table is exact; the assertion keeps a broken file from being stored.
export function makePdf(title: string, lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  let content = "BT /F1 11 Tf 56 792 Td 16 TL\n";
  content += `(${esc(title)}) Tj T*\n`;
  for (const line of lines) content += `(${esc(line)}) Tj T*\n`;
  content += "ET";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out, "latin1");
  // Xref entries must be exactly 20 bytes: the standard CRLF terminator is
  // required by strict parsers (e.g. pdfjs 1.x inside pdf-parse 1.x).
  out += "xref\n0 6\n0000000000 65535 f\r\n";
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n\r\n`;
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  offsets.forEach((off, i) => {
    if (!out.slice(off, off + 9).startsWith(`${i + 1} 0 obj`)) {
      throw new Error("PDF xref mismatch");
    }
  });
  return Buffer.from(out, "latin1");
}

// --- Shares ----------------------------------------------------------------------
export interface DemoShare {
  doc: string; // document name
  to: string;
  by: string;
  h: number;
}

export const DEMO_SHARES: DemoShare[] = [
  { doc: "credential-abuse-timeline.txt", to: "viewer", by: "investigator", h: 2.5 },
  { doc: "vendor-contract-summary.txt", to: "viewer", by: "legal", h: 10 },
  { doc: "takedown-report.txt", to: "viewer", by: "admin", h: 7 * 24 },
  { doc: "exposure-scope-assessment.txt", to: "legal", by: "investigator", h: 4 },
];

// --- Alerts (paired with alert_created audit rows by the inserter) ----------------
export interface DemoAlert {
  t: string;
  s: string;
  title: string;
  msg: string;
  u: string | null;
  ip: string;
  st: string; // new | investigating | resolved
  h: number;
  rt?: string; // related resource type
  ridDoc?: string; // related document (by name)
  ridUser?: string; // related user (by username)
}

export const DEMO_ALERTS: DemoAlert[] = [
  { t: "failed_logins", s: "high", title: "Multiple failed login attempts", msg: '3 failed sign-in attempts for "investigator" from 10.4.2.18 within 15 minutes.', u: "investigator", ip: "10.4.2.18", st: "new", h: 48.8, rt: "user", ridUser: "investigator" },
  { t: "bulk_download", s: "critical", title: "Unusual download activity", msg: "12 document downloads within 5 minutes from 172.16.8.41. Pattern flagged for review.", u: null, ip: "172.16.8.41", st: "resolved", h: 30, rt: "user" },
  { t: "account_created", s: "low", title: "New account registered", msg: "Noah Patel (@viewer) registered with the Viewer role.", u: "viewer", ip: "127.0.0.1", st: "investigating", h: 3 * 24, rt: "user", ridUser: "viewer" },
  { t: "sensitive_upload", s: "medium", title: "Top Secret document uploaded", msg: "exposure-scope-assessment.txt was uploaded to case SCV-2026-0004 with TOP SECRET classification by investigator.", u: "investigator", ip: "127.0.0.1", st: "new", h: 5, rt: "document", ridDoc: "exposure-scope-assessment.txt" },
];

// --- Audit history ------------------------------------------------------------------
// ridCase / ridDoc / ridAlert are reference tokens resolved by the inserter.
export interface DemoAudit {
  u: string | null;
  a: string;
  rt?: string;
  ridCase?: string;
  ridDoc?: string;
  ridAlert?: string;
  d: string;
  h: number;
  ip?: string;
  s?: boolean; // success (false = failed attempt)
  ua?: string;
}

export const DEMO_AUDIT: DemoAudit[] = [
  { u: "admin", a: "register", d: "Account created for Avery Stone (Administrator role)", h: 45 * 24 },
  { u: "s.reyes", a: "register", d: "Account created for Sofia Reyes (Investigator role)", h: 40 * 24 },
  { u: "investigator", a: "register", d: "Account created for Ivy Chen (Investigator role)", h: 30 * 24 },
  { u: "legal", a: "register", d: "Account created for Marcus Reid (Legal Officer role)", h: 21 * 24 },
  { u: "viewer", a: "register", d: "Account created for Noah Patel (Viewer role)", h: 3 * 24 },
  { u: "legal", a: "case_create", rt: "case", ridCase: "SCV-2026-0005", d: "Created case SCV-2026-0005 — Legacy IP infringement review", h: 30 * 24 },
  { u: "admin", a: "case_create", rt: "case", ridCase: "SCV-2026-0003", d: "Created case SCV-2026-0003 — Phishing campaign takedown", h: 10 * 24 },
  { u: "investigator", a: "case_create", rt: "case", ridCase: "SCV-2026-0001", d: "Created case SCV-2026-0001 — Cloud credentials misuse", h: 12 * 24 },
  { u: "legal", a: "case_create", rt: "case", ridCase: "SCV-2026-0002", d: "Created case SCV-2026-0002 — Vendor invoice fraud", h: 8 * 24 },
  { u: "investigator", a: "case_create", rt: "case", ridCase: "SCV-2026-0004", d: "Created case SCV-2026-0004 — Customer data exposure assessment", h: 6 * 24 },
  { u: "admin", a: "document_upload", rt: "document", ridDoc: "phishing-email-samples.txt", d: "Uploaded phishing-email-samples.txt to SCV-2026-0003 (sha256 demo-seed-001)", h: 9 * 24 },
  { u: "admin", a: "document_upload", rt: "document", ridDoc: "takedown-report.txt", d: "Uploaded takedown-report.txt to SCV-2026-0003 (sha256 demo-seed-002)", h: 8 * 24 },
  { u: "admin", a: "case_update", rt: "case", ridCase: "SCV-2026-0003", d: "Case SCV-2026-0003: status → closed", h: 8 * 24 },
  { u: "investigator", a: "document_upload", rt: "document", ridDoc: "access-reports-q3.txt", d: "Uploaded access-reports-q3.txt to SCV-2026-0001 (sha256 demo-seed-003)", h: 2 * 24 },
  { u: "investigator", a: "document_upload", rt: "document", ridDoc: "witness-statement-miller.pdf", d: "Uploaded witness-statement-miller.pdf to SCV-2026-0001 (sha256 demo-seed-004)", h: 24 },
  { u: "legal", a: "document_upload", rt: "document", ridDoc: "vendor-contract-summary.txt", d: "Uploaded vendor-contract-summary.txt to SCV-2026-0002 (sha256 demo-seed-005)", h: 4 * 24 },
  { u: "legal", a: "document_upload", rt: "document", ridDoc: "invoice-discrepancy-log.txt", d: "Uploaded invoice-discrepancy-log.txt to SCV-2026-0002 (sha256 demo-seed-006)", h: 12 },
  { u: "investigator", a: "document_upload", rt: "document", ridDoc: "affected-accounts-summary.txt", d: "Uploaded affected-accounts-summary.txt to SCV-2026-0004 (sha256 demo-seed-007)", h: 26 },
  { u: "legal", a: "document_upload", rt: "document", ridDoc: "breach-notification-draft.txt", d: "Uploaded breach-notification-draft.txt to SCV-2026-0004 (sha256 demo-seed-008)", h: 3 * 24 },
  { u: "legal", a: "case_update", rt: "case", ridCase: "SCV-2026-0005", d: "Case SCV-2026-0005: status → archived", h: 3 * 24 },
  { u: "investigator", a: "login_failed", d: 'Failed sign-in attempt for "investigator"', h: 49, ip: "10.4.2.18", s: false, ua: UA_CHROME },
  { u: "investigator", a: "login_failed", d: 'Failed sign-in attempt for "investigator"', h: 49, ip: "10.4.2.18", s: false, ua: UA_CHROME },
  { u: "investigator", a: "login_failed", d: 'Failed sign-in attempt for "investigator"', h: 48.9, ip: "10.4.2.18", s: false, ua: UA_CHROME },
  { u: "investigator", a: "login", d: "Signed in successfully", h: 48.8 },
  { u: "admin", a: "alert_update", rt: "alert", ridAlert: "account_created", d: 'Alert "New account registered" marked as investigating', h: 2 * 24 },
  { u: "investigator", a: "document_download", rt: "document", ridDoc: "witness-statement-miller.pdf", d: "Downloaded witness-statement-miller.pdf", h: 20 },
  { u: "viewer", a: "login", d: "Signed in successfully", h: 4 },
  { u: "viewer", a: "document_download", rt: "document", ridDoc: "vendor-contract-summary.txt", d: "Downloaded vendor-contract-summary.txt", h: 3.5 },
  { u: "investigator", a: "document_upload", rt: "document", ridDoc: "exposure-scope-assessment.txt", d: "Uploaded exposure-scope-assessment.txt to SCV-2026-0004 (sha256 demo-seed-009)", h: 5 },
  { u: "investigator", a: "document_upload", rt: "document", ridDoc: "credential-abuse-timeline.txt", d: "Uploaded credential-abuse-timeline.txt to SCV-2026-0001 (sha256 demo-seed-010)", h: 3 },
  { u: "admin", a: "document_share", rt: "document", ridDoc: "takedown-report.txt", d: "Shared takedown-report.txt with @viewer", h: 7 * 24 },
  { u: "legal", a: "document_share", rt: "document", ridDoc: "vendor-contract-summary.txt", d: "Shared vendor-contract-summary.txt with @viewer", h: 10 },
  { u: "investigator", a: "document_share", rt: "document", ridDoc: "exposure-scope-assessment.txt", d: "Shared exposure-scope-assessment.txt with @legal", h: 4 },
  { u: "investigator", a: "document_share", rt: "document", ridDoc: "credential-abuse-timeline.txt", d: "Shared credential-abuse-timeline.txt with @viewer", h: 2.5 },
  // Realistic denied attempts (feed the rule-based monitoring demo).
  { u: "viewer", a: "document_access_denied", d: "Attempted to access breach-notification-draft.txt without permission", h: 26, s: false },
  { u: "viewer", a: "permission_denied", d: "Permission denied: uploading a document", h: 26, s: false },
  { u: "legal", a: "permission_denied", d: "Permission denied: creating a case", h: 50, s: false },
];

export { randomBytes };
