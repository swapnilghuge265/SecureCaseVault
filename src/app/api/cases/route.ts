// POST /api/cases
// Creates a new case and assigns it an auto-generated case number
// (e.g. SCV-2026-0007).

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases, users } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logPermissionDenied } from "@/lib/detection";
import { CASE_CATEGORIES } from "@/lib/format";

const PRIORITIES = ["low", "medium", "high", "critical"];

export async function POST(req: Request) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "createCase")) {
    await logPermissionDenied(session.user, req, "creating a case");
    return Response.json({ error: "Your role does not allow creating cases." }, { status: 403 });
  }

  let body: { title?: string; category?: string; priority?: string; ownerId?: number; description?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const category = body.category ?? "Cyber Crime";
  const priority = body.priority ?? "medium";
  const ownerId = Number(body.ownerId ?? 0);
  const description = (body.description ?? "").trim();

  if (!title) return Response.json({ error: "A case title is required." }, { status: 400 });
  if (!CASE_CATEGORIES.includes(category))
    return Response.json({ error: "Unknown case category." }, { status: 400 });
  if (!PRIORITIES.includes(priority))
    return Response.json({ error: "Unknown priority." }, { status: 400 });

  // A case is assigned to an *investigator* — the target must be an active
  // account that actually holds the Investigator role.
  const [owner] = await db.select().from(users).where(eq(users.id, ownerId));
  if (!owner || owner.status !== "active" || owner.role !== "investigator")
    return Response.json(
      { error: "The assigned user must be an active account with the Investigator role." },
      { status: 400 },
    );

  // Build a case number like SCV-2026-0004 and nudge past any collision.
  const [countRow] = await db.select({ n: sql<number>`count(*)` }).from(cases);
  const year = new Date().getFullYear();
  let base = Number(countRow?.n ?? 0) + 1;
  let caseNumber = `SCV-${year}-${String(base).padStart(4, "0")}`;
  for (let i = 0; i < 10; i++) {
    const [existing] = await db.select({ id: cases.id }).from(cases).where(eq(cases.caseNumber, caseNumber));
    if (!existing) break;
    caseNumber = `SCV-${year}-${String(base + i + 1).padStart(4, "0")}`;
  }

  const [inserted] = await db
    .insert(cases)
    .values({
      caseNumber,
      title,
      description: description || null,
      category,
      priority,
      ownerId,
      createdBy: session.user.id,
    })
    .returning();

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "case_create",
      resourceType: "case",
      resourceId: String(inserted.id),
      detail: `Created case ${caseNumber} — ${title}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true, id: inserted.id, caseNumber });
}
