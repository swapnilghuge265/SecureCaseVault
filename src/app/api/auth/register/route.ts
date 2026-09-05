// POST /api/auth/register
// Creates a new account. To keep the prototype safe, self-registration
// always grants the "viewer" role — elevated roles must be assigned by an
// administrator (a deliberate, realistic permission model).

import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { db } from "@/db";
import { users } from "@/db/schema";
import {
  clientIp,
  createSession,
  sessionCookieHeaders,
} from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { raiseAlert } from "@/lib/alerts";
import { ensureDevData } from "@/lib/bootstrap";

export async function POST(req: Request) {
  await ensureDevData(); // same dev bootstrap as the login route

  const ip = clientIp(req);

  let body: {
    fullName?: string;
    username?: string;
    email?: string;
    password?: string;
  };

  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const fullName = (body.fullName ?? "").trim();
  const username = (body.username ?? "").trim().toLowerCase();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  // --- Validation (mirrors the client-side checks, server always re-checks)

  if (fullName.length < 2) {
    return Response.json(
      { error: "Please enter your full name." },
      { status: 400 },
    );
  }

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return Response.json(
      {
        error:
          "Username must be 3–24 characters: letters, numbers or underscores.",
      },
      { status: 400 },
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  if (
    password.length < 8 ||
    !/[a-zA-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return Response.json(
      {
        error:
          "Password must be at least 8 characters and include letters and numbers.",
      },
      { status: 400 },
    );
  }

  // --- Uniqueness checks

  const [dupUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username));

  if (dupUser) {
    return Response.json(
      { error: "That username is already taken." },
      { status: 409 },
    );
  }

  const [dupEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  if (dupEmail) {
    return Response.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  // --- Create the account
  // Self-registration ALWAYS creates a Viewer.
  // Users cannot choose or submit an elevated role.

  const passwordHash = await bcrypt.hash(password, 10);

  const [inserted] = await db
    .insert(users)
    .values({
      fullName,
      username,
      email,
      passwordHash,
      role: "viewer",
    })
    .returning();

  await logAudit(
    {
      userId: inserted.id,
      username,
      action: "register",
      detail: `Account created for ${fullName} (Viewer role)`,
      ip,
      success: true,
    },
    req,
  );

  await raiseAlert(
    {
      type: "account_created",
      severity: "low",
      title: "New account registered",
      message: `${fullName} (@${username}) registered with the Viewer role.`,
      userId: inserted.id,
      ip,
    },
    { userId: inserted.id, username, ip },
  );

  // Auto sign-in after successful registration.
  const { token } = await createSession(inserted.id, ip);

  await logAudit(
    {
      userId: inserted.id,
      username,
      action: "login",
      detail: "Signed in after registration",
      ip,
    },
    req,
  );

  // Authentication is handled through the HttpOnly session cookie.
  // The session token is intentionally NOT returned to the client.
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  for (const setCookie of sessionCookieHeaders(req, token)) {
    headers.append("Set-Cookie", setCookie);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      username,
    }),
    {
      status: 200,
      headers,
    },
  );
}