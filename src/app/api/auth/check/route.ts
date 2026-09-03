
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const session = await getSessionUser();

  return Response.json({
    authenticated: !!session,
    role: session ? session.user.role : null,
  });
}