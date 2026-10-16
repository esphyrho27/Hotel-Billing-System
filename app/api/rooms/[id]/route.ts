import { z } from 'zod';
import { guard } from '../../../../lib/auth';
import { queryOne, exec } from '../../../../lib/db';
import { audit, clientIp } from '../../../../lib/audit';
import { parseBody, routeId, type RouteCtx } from '../../../../lib/validate';

const STATUSES = ['AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE'] as const;

const schema = z.object({ status: z.enum(STATUSES) });

/**
 * Manual status changes. OCCUPIED is system-managed (check-in/check-out);
 * only admin/manager may force it. Everyone else may toggle
 * AVAILABLE <-> CLEANING <-> MAINTENANCE.
 */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const room = await queryOne<{ status: string }>(`SELECT status FROM rooms WHERE id = ?`, [id]);
  if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 });

  const { status } = parsed.data;
  const isPrivileged = g.user.role === 'admin' || g.user.role === 'manager';
  if ((status === 'OCCUPIED' || room.status === 'OCCUPIED') && !isPrivileged) {
    return Response.json(
      { error: 'OCCUPIED is managed by check-in/check-out. Ask a manager to override.' },
      { status: 409 },
    );
  }
  if (room.status === status) return Response.json({ ok: true, status });

  await exec(`UPDATE rooms SET status = ? WHERE id = ?`, [status, id]);
  await audit(g.user.id, 'room.status', 'room', id, { from: room.status, to: status }, clientIp(req));
  return Response.json({ ok: true, status });
}
