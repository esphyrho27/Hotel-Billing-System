import { guard } from '../../../../../lib/auth';
import { queryOne, exec, toNum, round2 } from '../../../../../lib/db';
import { audit, clientIp } from '../../../../../lib/audit';
import { routeId, type RouteCtx } from '../../../../../lib/validate';

/**
 * Post missing nightly ROOM charges for a stay.
 * Idempotent: each night uses idempotency_key `roomchg:{stayId}:{YYYY-MM-DD}`.
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }

  const stay = await queryOne<{
    id: number; status: string; checkin_at: string; planned_checkout: string; room_id: number;
  }>(`SELECT id, status, checkin_at, planned_checkout, room_id FROM stays WHERE id = ?`, [id]);
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') return Response.json({ error: 'Stay is not active.' }, { status: 409 });

  const folio = await queryOne<{ id: number; status: string }>(`SELECT id, status FROM folios WHERE stay_id = ?`, [id]);
  if (!folio) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  if (folio.status !== 'OPEN') return Response.json({ error: 'Folio is not open.' }, { status: 409 });

  const room = await queryOne<{ room_number: string; nightly_rate: unknown }>(
    `SELECT r.room_number, rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ?`,
    [stay.room_id],
  );
  if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 });
  const rate = toNum(room.nightly_rate);

  const checkinDate = new Date(String(stay.checkin_at).slice(0, 10) + 'T00:00:00');
  const plannedDate = new Date(String(stay.planned_checkout).slice(0, 10) + 'T00:00:00');
  const nights = Math.max(1, Math.round((plannedDate.getTime() - checkinDate.getTime()) / 86400000));

  let posted = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(checkinDate);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const key = `roomchg:${id}:${ds}`;
    const res = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM charges WHERE idempotency_key = ?`, [key]);
    if (res && Number(res.n) > 0) continue;
    await exec(
      `INSERT INTO charges (folio_id, category, description, quantity, unit_price, amount, idempotency_key, created_by)
       VALUES (?, 'ROOM', ?, 1, ?, ?, ?, ?)`,
      [folio.id, `Room charge — ${ds} (Room ${room.room_number} @ ₱${rate.toFixed(2)}/night)`, rate, round2(rate), key, g.user.id],
    );
    posted++;
  }

  await audit(g.user.id, 'folio.room_charges', 'folio', folio.id, { nights, posted }, clientIp(_req));
  return Response.json({ ok: true, nights, posted });
}
