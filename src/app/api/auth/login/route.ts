// POST /api/auth/login
// Verifies credentials, starts a session (httpOnly cookie) and writes an
// audit entry. Failed attempts are tracked and can raise a security alert
// after 3 failures within 15 minutes (see src/lib/alerts.ts).

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { clientIp, createSession, sessionCookieHeaders } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { checkFailedLoginRules } from "@/lib/detection";
import { ensureDevData } from "@/lib/bootstrap";


export async function POST(req: Request) {
  // Dev bootstrap: on an empty/reset database this recreates the core
  // tables and the demo accounts (idempotent — never duplicates). This is
  // what keeps the demo log-in-able without running a manual seed script.
  await ensureDevData();

  const ip = clientIp(req);

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return Response.json({ error: "Username and password are required." }, { status: 400 });
  }

  

  const [user] = await db.select().from(users).where(eq(users.username, username));

  
  // compare() also verifies that a hash exists — never compare plain text.
  const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;

  
  if (!user || !passwordOk) {
    await logAudit(
      {
        username,
        action: "login_failed",
        detail: `Failed sign-in attempt for "${username}"`,
        ip,
        success: false,
      },
      req,
    );
    // Rule-based monitoring (R1–R3): repeated failures, single-IP login
    // bursts, and attempts against nonexistent accounts.
    await checkFailedLoginRules(username, ip, !!user);
    return Response.json({ error: "Invalid username or password." }, { status: 401 });
  }

  if (user.status !== "active") {
    return Response.json({ error: "This account has been suspended." }, { status: 403 });
  }

  const { token } = await createSession(user.id, ip);
  await logAudit(
    {
      userId: user.id,
      username: user.username,
      action: "login",
      detail: "Signed in successfully",
      ip,
      success: true,
    },
    req,
  );

  // Attach the session cookie(s) for THIS transport (see
  // sessionCookieHeaders): SameSite=None+Secure(+Partitioned twin) over
  // HTTPS, SameSite=Lax without Secure over plain-HTTP local development.
  const headers = new Headers({ "Content-Type": "application/json" });
  for (const setCookie of sessionCookieHeaders(req, token)) {
    headers.append("Set-Cookie", setCookie);
  }

  return new Response(JSON.stringify({ ok: true }), {
  status: 200,
  headers,
});
}