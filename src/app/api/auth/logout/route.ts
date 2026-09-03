// POST /api/auth/logout
// Destroys the current session row, clears the cookie and logs the event.

import { requireApiUser, destroySession, clientIp } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await requireApiUser(req);
  if (session) {
    await logAudit(
      {
        userId: session.user.id,
        username: session.user.username,
        action: "logout",
        detail: "Signed out",
        ip: clientIp(req),
      },
      req,
    );
  }
  await destroySession();
  return Response.json({ ok: true });
}
