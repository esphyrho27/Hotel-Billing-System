import { getSession, unauthorized } from '../../../../lib/auth';

export async function GET() {
  const user = await getSession();
  if (!user) return unauthorized();
  return Response.json({ user });
}
