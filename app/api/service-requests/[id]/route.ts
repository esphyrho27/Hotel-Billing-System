import { z } from 'zod';
import { guard } from '../../../../lib/auth';
import { queryOne, withTransaction, toNum, round2 } from '../../../../lib/db';
import { audit, clientIp } from '../../../../lib/audit';
import { parseBody, routeId, type RouteCtx } from '../../../../lib/validate';

const TRANSITIONS: Record<string, string[]> = {
  NEW: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** service_type → charge category for auto-posted charges. */
function chargeCategory(serviceType: string): string {
  switch (serviceType) {
    case 'FOOD_BEVERAGE':
      return 'ROOM_SERVICE';
    case 'HOUSEKEEPING':
      return 'SERVICE';
    case 'MAINTENANCE':
    case 'FRONT_DESK':
      return 'SERVICE';
    default:
      return 'OTHER';
  }
}

const schema = z.object({
  status: z.enum(['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
});

export async function PATCH(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'service']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const sr = await queryOne<{
    id: number; stay_id: number; request_code: string; service_type: string;
    request_kind: string; requested_room_id: number | null; description: string;
    status: string; chargeable: number; price: unknown;
  }>(`SELECT * FROM service_requests WHERE id = ?`, [id]);
  if (!sr) return Response.json({ error: 'Service request not found.' }, { status: 404 });

  const allowed = TRANSITIONS[sr.status] ?? [];
  if (!allowed.includes(parsed.data.status)) {
    return Response.json({ error: `Cannot move status from ${sr.status} to ${parsed.data.status}.` }, { status: 409 });
  }

  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const result = await withTransaction(async conn => {
    const notes: string[] = [];
    await conn.execute(
      `UPDATE service_requests SET status = ?, fulfilled_at = ${parsed.data.status === 'COMPLETED' ? '?' : 'fulfilled_at'}, completed_by = ? WHERE id = ?`,
      parsed.data.status === 'COMPLETED' ? [parsed.data.status, nowSql, g.user.id, id] : [parsed.data.status, g.user.id, id],
    );

    if (parsed.data.status === 'COMPLETED') {
      const folioRows = (await conn.execute(`SELECT id, status FROM folios WHERE stay_id = ?`, [sr.stay_id]))[0] as { id: number; status: string }[];
      const folio = folioRows[0];
      const price = toNum(sr.price);

      // 1) Chargeable service → post charge (idempotent).
      if (sr.chargeable && price > 0 && folio && folio.status === 'OPEN') {
        const key = `svcreq:${sr.id}`;
        const dup = (await conn.execute(`SELECT COUNT(*) AS n FROM charges WHERE idempotency_key = ?`, [key]))[0] as { n: number }[];
        if (Number(dup[0]?.n ?? 0) === 0) {
          await conn.execute(
            `INSERT INTO charges (folio_id, category, description, quantity, unit_price, amount, service_request_id, idempotency_key, created_by)
             VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)`,
            [folio.id, chargeCategory(sr.service_type), `${sr.service_type.replace(/_/g, ' ')} — ${sr.description}`.slice(0, 255), price, round2(price), sr.id, key, g.user.id],
          );
          notes.push(`Posted ₱${price.toFixed(2)} charge to folio.`);
        }
      }

      // 2) Room transfer → move stay, update room statuses, record transfer.
      if (sr.request_kind === 'ROOM_TRANSFER' && sr.requested_room_id) {
        const stayRows = (await conn.execute(`SELECT room_id FROM stays WHERE id = ? FOR UPDATE`, [sr.stay_id]))[0] as { room_id: number }[];
        const fromRoomId = stayRows[0]?.room_id;
        if (!fromRoomId) throw Object.assign(new Error('Stay not found.'), { status: 404 });
        const newRoomRows = (await conn.execute(
          `SELECT r.id, r.status, rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ? FOR UPDATE`,
          [sr.requested_room_id],
        ))[0] as { id: number; status: string; nightly_rate: unknown }[];
        const newRoom = newRoomRows[0];
        if (!newRoom) throw Object.assign(new Error('Requested room not found.'), { status: 404 });
        if (newRoom.status !== 'AVAILABLE') throw Object.assign(new Error(`Requested room is ${newRoom.status}.`), { status: 409 });
        const oldRoomRows = (await conn.execute(
          `SELECT rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ?`,
          [fromRoomId],
        ))[0] as { nightly_rate: unknown }[];
        await conn.execute(
          `INSERT INTO room_transfers (stay_id, from_room_id, to_room_id, effective_date, old_rate, new_rate, reason, authorized_by)
           VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?)`,
          [sr.stay_id, fromRoomId, sr.requested_room_id, toNum(oldRoomRows[0]?.nightly_rate), toNum(newRoom.nightly_rate), sr.description.slice(0, 255), g.user.id],
        );
        await conn.execute(`UPDATE stays SET room_id = ? WHERE id = ?`, [sr.requested_room_id, sr.stay_id]);
        await conn.execute(`UPDATE rooms SET status = 'CLEANING' WHERE id = ?`, [fromRoomId]);
        await conn.execute(`UPDATE rooms SET status = 'OCCUPIED' WHERE id = ?`, [sr.requested_room_id]);
        notes.push('Room transfer completed.');
      }
    }
    return { notes };
  });

  await audit(g.user.id, 'service_request.status', 'service_request', id, { from: sr.status, to: parsed.data.status }, clientIp(req));
  return Response.json({ ok: true, notes: result.notes });
}
