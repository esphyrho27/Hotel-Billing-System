import { destroySession, getSession } from '../../../../lib/auth';
import { audit, clientIp } from '../../../../lib/audit';

export async function POST(req: Request) {
  const user = await getSession();
  await destroySession();
  if (user) await audit(user.id, 'logout', 'user', user.id, undefined, clientIp(req));
  return Response.json({ ok: true });
}
