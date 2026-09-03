import { db } from "@/db";
import { sql } from "drizzle-orm";
import { ensureDevData } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// The platform health check hits this endpoint when the server starts, which
// is also what (re)initializes the development workspace: core tables, demo
// accounts and demo case data — each guarded to be a no-op when data already
// exists (no duplicates, never touches real user data).
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    await ensureDevData();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
