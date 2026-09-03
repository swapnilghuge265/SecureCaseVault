// /api/cases/:id
//  PATCH  — edit the case: title, description, type, priority, status and
//           the assigned investigator (admin + investigator roles)
//  DELETE — remove the case and all of its documents (admin only)
//
// Every field change is described in the audit log entry, so the history
// shows not just *that* a case changed, but exactly *what* changed.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, users } from "@/db/schema";
import { can, clientIp, requireApiUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logPermissionDenied } from "@/lib/detection";
import { CASE_CATEGORIES } from "@/lib/format";

const STATUSES = ["open", "investigating", "pending", "closed", "archived"];
const PRIORITIES = ["low", "medium", "high", "critical"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "updateCase")) {
    await logPermissionDenied(session.user, req, "updating a case");
    return Response.json({ error: "Your role does not allow updating cases." }, { status: 403 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(cases).where(eq(cases.id, Number(id)));
  if (!existing) return Response.json({ error: "Case not found." }, { status: 404 });

  let body: {
    title?: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
    ownerId?: number;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const changes: Partial<typeof cases.$inferInsert> = {};
  const parts: string[] = [];

  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return Response.json({ error: "A case title is required." }, { status: 400 });
    if (title !== existing.title) {
      changes.title = title;
      parts.push("title updated");
    }
  }

  if (body.description !== undefined) {
    const description = body.description.trim();
    if (description !== (existing.description ?? "")) {
      changes.description = description || null;
      parts.push("description updated");
    }
  }

  if (body.category) {
    if (!CASE_CATEGORIES.includes(body.category))
      return Response.json({ error: "Unknown case type." }, { status: 400 });
    if (body.category !== existing.category) {
      changes.category = body.category;
      parts.push(`type → ${body.category}`);
    }
  }

  if (body.priority) {
    if (!PRIORITIES.includes(body.priority))
      return Response.json({ error: "Unknown priority." }, { status: 400 });
    if (body.priority !== existing.priority) {
      changes.priority = body.priority;
      parts.push(`priority → ${body.priority}`);
    }
  }

  if (body.status) {
    if (!STATUSES.includes(body.status))
      return Response.json({ error: "Unknown status." }, { status: 400 });
    if (body.status !== existing.status) {
      changes.status = body.status;
      parts.push(`status → ${body.status}`);
    }
  }

  if (body.ownerId !== undefined) {
    // Re-assignment follows the same rule as creation: only an active
    // Investigator-role account may be assigned to a case.
    const [owner] = await db.select().from(users).where(eq(users.id, Number(body.ownerId)));
    if (!owner || owner.status !== "active" || owner.role !== "investigator")
      return Response.json(
        { error: "The assigned user must be an active account with the Investigator role." },
        { status: 400 },
      );
    if (owner.id !== existing.ownerId) {
      changes.ownerId = owner.id;
      parts.push(`assigned to ${owner.fullName}`);
    }
  }

  if (Object.keys(changes).length === 0) return Response.json({ ok: true });

  changes.updatedAt = new Date();
  await db.update(cases).set(changes).where(eq(cases.id, existing.id));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "case_update",
      resourceType: "case",
      resourceId: String(existing.id),
      detail: `Case ${existing.caseNumber}: ${parts.join(", ")}`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiUser(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!can(session.user.role, "deleteCase")) {
    await logPermissionDenied(session.user, req, "deleting a case");
    return Response.json({ error: "Only administrators can delete cases." }, { status: 403 });
  }

  const { id } = await params;
  const [existing] = await db.select().from(cases).where(eq(cases.id, Number(id)));
  if (!existing) return Response.json({ error: "Case not found." }, { status: 404 });

  // Documents are removed automatically via the ON DELETE CASCADE foreign key.
  await db.delete(cases).where(eq(cases.id, existing.id));

  await logAudit(
    {
      userId: session.user.id,
      username: session.user.username,
      action: "case_delete",
      resourceType: "case",
      resourceId: String(existing.id),
      detail: `Deleted case ${existing.caseNumber} — ${existing.title} (documents removed)`,
      ip: clientIp(req),
    },
    req,
  );

  return Response.json({ ok: true });
}
