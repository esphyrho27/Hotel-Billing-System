import { z } from 'zod';
import {
  findUserByUsername,
  verifyPassword,
  createSession,
  loginAttemptKey,
  isLocked,
  registerFailedLogin,
  clearLoginAttempts,
} from '../../../../lib/auth';
import { audit, clientIp } from '../../../../lib/audit';
import { parseBody } from '../../../../lib/validate';

const schema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseBody(schema, body);
  if (!parsed.ok) return parsed.response;

  const { username, password } = parsed.data;
  const key = loginAttemptKey(username);

  const lock = await isLocked(key);
  if (lock.locked) {
    return Response.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(lock.retryAfterSec / 60)} minute(s).`, retryAfterSec: lock.retryAfterSec },
      { status: 423 },
    );
  }

  const user = await findUserByUsername(username);
  const valid = user && user.active ? await verifyPassword(password, user.password_hash) : false;
  if (!user || !user.active || !valid) {
    await registerFailedLogin(key);
    await audit(user?.id ?? null, 'login.failed', 'user', user?.id ?? null, { username }, clientIp(req));
    return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  await clearLoginAttempts(key);
  await createSession({ id: user.id, username: user.username, role: user.role, session_version: user.session_version });
  await audit(user.id, 'login.success', 'user', user.id, undefined, clientIp(req));
  return Response.json({ user: { id: user.id, username: user.username, role: user.role } });
}
