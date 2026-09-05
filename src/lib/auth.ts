// ---------------------------------------------------------------------------
// Authentication + authorization service (server-side only).
//
// How it works:
//  1. On successful login we create a random 256-bit token, store it in the
//     `sessions` table and send it back as an httpOnly cookie.
//  2. Every protected page / API route calls getSessionUser() which reads the
//     cookie, checks the session row (exists + not expired) and loads the
//     active user.
//  3. Role checks are centralized in can() so permission rules live in one
//     place instead of being scattered across route handlers.
// ---------------------------------------------------------------------------

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export type Role = "administrator" | "investigator" | "legal_officer" | "viewer";

const COOKIE_NAME = "scv_session";
const SESSION_HOURS = 8;
const INACTIVITY_MINUTES = 10;

export interface SessionUser {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  status: string;
  notifySecurity: boolean;
  notifyDigest: boolean;
  createdAt: Date;
}

// Best-effort client IP (respects a proxy header if one is set).
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
}

// Create the session row (the Flask-Login `login_user()` equivalent: the
// random 256-bit token IS the session, looked up in the database on every
// request). The route handler attaches the cookie headers via
// sessionCookieHeaders() so they can be tuned per transport.
export async function createSession(userId: number, ip: string) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);

  await db.insert(sessions).values({ id: token, userId, ipAddress: ip, expiresAt });

  return { token, expiresAt };
}

// Build the Set-Cookie header(s) for a session, adapted to the real
// browser-facing transport (override for local `next start` over plain http:
// SCV_LOCAL_HTTP=true in .env):
//
//   HTTPS (hosted preview — possibly embedded in an iframe):
//     1) SameSite=None; Secure; HttpOnly  — required for the cookie to be
//        sent in embedded/cross-site contexts (Lax is never sent there).
//     2) A CHIPS "Partitioned" twin of the same cookie — Chromium blocks
//        plain third-party cookies in iframes, but Partitioned cookies are
//        stored (per top-level site) and sent back. Sending both is the
//        documented CHIPS migration pattern; browsers that don't know the
//        Partitioned attribute ignore it (duplicate with the same value).
//
//   Plain HTTP (local development, http://localhost):
//     SameSite=Lax, NO Secure flag — browsers refuse to store Secure
//     cookies over plain http, so forcing it would break local dev login.
//
export function sessionCookieHeaders(req: Request, token: string): string[] {
  // Decide whether the BROWSER-FACING edge is TLS. The proxy in front of
  // this server terminates TLS and forwards plain HTTP upstream, so the
  // transport the Next server sees is NOT what the browser uses — detect:
  const forwarded = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  let isHttps: boolean;
  if (process.env.SCV_LOCAL_HTTP === "true") {
    // Explicit operator override: `npm run start` over plain
    // http://localhost — use HTTP-appropriate cookies.
    isHttps = false;
  } else if (forwarded === "https") {
    isHttps = true;
  } else if (process.env.NODE_ENV !== "production") {
    // Development (`npm run dev`): follow the actual transport — plain
    // http://localhost automatically gets HTTP-appropriate cookies.
    try {
      isHttps = new URL(req.url).protocol === "https:";
    } catch {
      isHttps = false;
    }
  } else {
    // Production: the hosted preview sits behind an HTTPS proxy → HTTPS
    // cookies. Running `next start` locally over plain http? Set
    // SCV_LOCAL_HTTP=true in .env (see .env.example).
    isHttps = true;
  }

  const base = `${COOKIE_NAME}=${token}; Path=/; HttpOnly`;
  if (isHttps) {
    const secureNone = `${base}; SameSite=None; Secure`;
    return [secureNone, `${secureNone}; Partitioned`];
  }
  return [`${base}; SameSite=Lax`];
}

// Delete the session row + clear the cookie.
// Deleting the DB row is what truly ends the session: even a stale cookie
// (e.g. a Partitioned twin a browser won't let us expire) references a
// token that no longer exists, so it authenticates as nobody.
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token));
  }

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export interface SessionInfo {
  createdAt: Date;
  expiresAt: Date;
  ipAddress: string | null;
}

// Returns { user, session } for the current cookie, or null when unauthenticated.
export async function getSessionUser(): Promise<{ user: SessionUser; session: SessionInfo } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [row] = await db.select().from(sessions).where(eq(sessions.id, token));
  if (!row) return null;

  // Expired session: clean it up and force re-login.
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.id));
    return null;
  }
  const inactivityLimit = INACTIVITY_MINUTES * 60 * 1000;

if (row.lastActivity.getTime() + inactivityLimit < Date.now()) {
  await db.delete(sessions).where(eq(sessions.id, row.id));
  return null;
}

await db
  .update(sessions)
  .set({ lastActivity: new Date() })
  .where(eq(sessions.id, row.id));

  const [user] = await db.select().from(users).where(eq(users.id, row.userId));
  if (!user || user.status !== "active") return null;

  return {
    user: { ...user, role: user.role as SessionUser["role"] },
    session: {
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      ipAddress: row.ipAddress,
    },
  };
}

// For page components: redirect to /login when no valid session exists.
export async function requireUser() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  return session;
}

// For API route handlers: return null instead of redirecting (route returns 401).
export async function requireApiUser(req: Request) {
  return getSessionUser();
}

// ---------------------------------------------------------------------------
// Role-based permission matrix. Add new actions here as the app grows.
// ---------------------------------------------------------------------------

export type Action =
  | "upload"
  | "deleteDocument"
  | "createCase"
  | "updateCase"
  | "deleteCase"
  | "manageAlerts"
  | "manageUsers"
  | "viewAudit"
  | "shareDocument";

// Permission matrix (per the product spec):
//  - Administrator : manage users, all cases, all documents, audit logs, alerts
//  - Investigator  : create cases, upload documents, work on assigned cases,
//                    share documents
//  - Legal Officer : read-only access to assigned cases & authorized documents
//  - Viewer        : sees only documents explicitly shared with them
//                    (see src/lib/visibility.ts for the "sees what" rules)
const PERMISSIONS: Record<Action, Role[]> = {
  upload: ["administrator", "investigator"],
  deleteDocument: ["administrator"],
  createCase: ["administrator", "investigator"],
  updateCase: ["administrator", "investigator"],
  deleteCase: ["administrator"],
  manageAlerts: ["administrator"],
  manageUsers: ["administrator"],
  viewAudit: ["administrator"],
  shareDocument: ["administrator", "investigator"],
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action].includes(role);
}

// Used on the Settings page to explain what the current role can do.
export const PERMISSION_DESCRIPTIONS: { action: string; roles: string[] }[] = [
  { action: "Manage users (roles & status)", roles: ["administrator"] },
  { action: "Manage all cases & documents", roles: ["administrator"] },
  { action: "Create cases & upload documents", roles: ["administrator", "investigator"] },
  { action: "View assigned cases (owned or created)", roles: ["administrator", "investigator", "legal_officer"] },
  { action: "Share documents with other users", roles: ["administrator", "investigator"] },
  { action: "View audit logs & manage alerts", roles: ["administrator"] },
  { action: "View documents shared with you", roles: ["administrator", "investigator", "legal_officer", "viewer"] },
];
