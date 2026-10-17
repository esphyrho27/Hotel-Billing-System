import { guard } from '../../../../../lib/auth';
import { queryOne } from '../../../../../lib/db';
import { postMissingRoomCharges } from '../../../../../lib/folio';
import { audit, clientIp } from '../../../../../lib/audit';
import { routeId, type RouteCtx } from '../../../../../lib/validate';

/**
 * Post missing nightly ROOM charges for a stay.
 * Idempotent: each night uses idempotency_key `roomchg:{stayId}:{YYYY-MM-DD}`.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }

  const stay = await queryOne<{ status: string }>(`SELECT status FROM stays WHERE id = ?`, [id]);
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') return Response.json({ error: 'Stay is not active.' }, { status: 409 });
  const folio = await queryOne<{ status: string }>(`SELECT status FROM folios WHERE stay_id = ?`, [id]);
  if (!folio) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  if (folio.status !== 'OPEN') return Response.json({ error: 'Folio is not open.' }, { status: 409 });

  const { nights, posted } = await postMissingRoomCharges(id, g.user.id);
  await audit(g.user.id, 'folio.room_charges', 'folio', id, { nights, posted }, clientIp(req));
  return Response.json({ ok: true, nights, posted });
}
