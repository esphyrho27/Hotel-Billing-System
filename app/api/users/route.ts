import { z } from 'zod';
import { guard, hashPassword, ROLES, type Role } from '../../../lib/auth';
import { query, exec } from '../../../lib/db';
import { audit, clientIp } from '../../../lib/audit';
import { parseBody } from '../../../lib/validate';

export async function GET() {
  const g = await guard(['admin']);
  if (!g.ok) return g.response;
  const users = await query(
    `SELECT id, username, role, active, created_at FROM users ORDER BY username ASC`,
  );
  return Response.json({ users });
}

const schema = z.object({
  username: z.string().min(3).max(80).regex(/^[a-zA-Z0-9_.-]+$/, 'Letters, numbers, dot, dash and underscore only.'),
  password: z.string().min(8).max(200),
  role: z.enum(ROLES as [Role, ...Role[]]),
});

export async function POST(req: Request) {
  const g = await guard(['admin']);
  if (!g.ok) return g.response;
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { username, password, role } = parsed.data;
  try {
    const { insertId } = await exec(
      `INSERT INTO users (username, password_hash, role, active) VALUES (?, ?, ?, 1)`,
      [username.trim(), await hashPassword(password), role],
    );
    await audit(g.user.id, 'user.create', 'user', insertId, { username, role }, clientIp(req));
    return Response.json({ ok: true, id: insertId }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Username already exists.' }, { status: 409 });
    }
    throw e;
  }
}
