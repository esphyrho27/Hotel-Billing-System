import { z } from 'zod';
import { guard, hashPassword, ROLES, type Role } from '../../../../lib/auth';
import { queryOne, exec, type SqlParams } from '../../../../lib/db';
import { audit, clientIp } from '../../../../lib/audit';
import { parseBody, routeId, type RouteCtx } from '../../../../lib/validate';

const schema = z.object({
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

/**
 * Admin: update role / active / reset password of any user.
 * Any authenticated user: change their OWN password.
 * Password changes bump session_version to invalidate other sessions.
 */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const g = await guard();
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const isSelf = id === g.user.id;
  const isAdmin = g.user.role === 'admin';
  if (!isAdmin && !isSelf) return Response.json({ error: 'Forbidden.' }, { status: 403 });

  const target = await queryOne<{ username: string }>(`SELECT username FROM users WHERE id = ?`, [id]);
  if (!target) return Response.json({ error: 'User not found.' }, { status: 404 });

  const { role, active, password } = parsed.data;
  if (!isAdmin && (role !== undefined || active !== undefined)) {
    return Response.json({ error: 'Only admins can change role or active status.' }, { status: 403 });
  }
  if (isAdmin && isSelf && active === false) {
    return Response.json({ error: 'You cannot deactivate your own account.' }, { status: 422 });
  }

  const sets: string[] = [];
  const params: SqlParams = [];
  if (role !== undefined) {
    sets.push('role = ?');
    params.push(role);
  }
  if (active !== undefined) {
    sets.push('active = ?');
    params.push(active ? 1 : 0);
  }
  if (password !== undefined) {
    sets.push('password_hash = ?', 'session_version = session_version + 1');
    params.push(await hashPassword(password));
  }
  if (sets.length === 0) return Response.json({ error: 'Nothing to update.' }, { status: 400 });

  await exec(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  await audit(
    g.user.id,
    password !== undefined ? 'user.password_reset' : 'user.update',
    'user',
    id,
    { role, active },
    clientIp(req),
  );
  return Response.json({ ok: true });
}
