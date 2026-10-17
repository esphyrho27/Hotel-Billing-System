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
  status: z.enum(['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  // Assign / change the target room for a ROOM_TRANSFER request (staff only).
  requested_room_id: z.number().int().positive().optional(),
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
  const { status: newStatus, requested_room_id: newRoomId } = parsed.data;
  if (!newStatus && newRoomId === undefined) {
    return Response.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const sr = await queryOne<{
    id: number; stay_id: number; request_code: string; service_type: string;
    request_kind: string; requested_room_id: number | null; description: string;
    status: string; chargeable: number; price: unknown;
  }>(`SELECT * FROM service_requests WHERE id = ?`, [id]);
  if (!sr) return Response.json({ error: 'Service request not found.' }, { status: 404 });

  if (newStatus) {
    const allowed = TRANSITIONS[sr.status] ?? [];
    if (!allowed.includes(newStatus)) {
      return Response.json({ error: `Cannot move status from ${sr.status} to ${newStatus}.` }, { status: 409 });
    }
  }

  // Staff may assign the target room on a ROOM_TRANSFER request (e.g. guest asked
  // for a room change without picking one). Not allowed once completed/cancelled.
  let targetRoomId = sr.requested_room_id;
  if (newRoomId !== undefined) {
    if (!['admin', 'manager', 'frontdesk'].includes(g.user.role)) {
      return Response.json({ error: 'Only front desk, managers or admins can assign the transfer room.' }, { status: 403 });
    }
    if (sr.request_kind !== 'ROOM_TRANSFER') {
      return Response.json({ error: 'Target room can only be set on room transfer requests.' }, { status: 400 });
    }
    if (sr.status === 'COMPLETED' || sr.status === 'CANCELLED') {
      return Response.json({ error: `Cannot change room on a ${sr.status} request.` }, { status: 409 });
    }
    const room = await queryOne<{ status: string }>(`SELECT status FROM rooms WHERE id = ?`, [newRoomId]);
    if (!room) return Response.json({ error: 'Room not found.' }, { status: 404 });
    if (room.status !== 'AVAILABLE') {
      return Response.json({ error: `Room is ${room.status} — only AVAILABLE rooms can be assigned.` }, { status: 409 });
    }
    targetRoomId = newRoomId;
  }
  // Completing a transfer requires a target room.
  if (newStatus === 'COMPLETED' && sr.request_kind === 'ROOM_TRANSFER' && !targetRoomId) {
    return Response.json({ error: 'Assign a target room before completing this transfer.' }, { status: 409 });
  }
  const finalStatus = newStatus ?? sr.status;

  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const result = await withTransaction(async conn => {
    const notes: string[] = [];
    if (targetRoomId !== sr.requested_room_id) {
      await conn.execute(`UPDATE service_requests SET requested_room_id = ? WHERE id = ?`, [targetRoomId, id]);
      notes.push('Target room assigned.');
    }
    await conn.execute(
      `UPDATE service_requests SET status = ?, fulfilled_at = ${finalStatus === 'COMPLETED' ? '?' : 'fulfilled_at'}, completed_by = ? WHERE id = ?`,
      finalStatus === 'COMPLETED' ? [finalStatus, nowSql, g.user.id, id] : [finalStatus, g.user.id, id],
    );

    if (finalStatus === 'COMPLETED') {
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
      if (sr.request_kind === 'ROOM_TRANSFER' && targetRoomId) {
        const stayRows = (await conn.execute(`SELECT room_id FROM stays WHERE id = ? FOR UPDATE`, [sr.stay_id]))[0] as { room_id: number }[];
        const fromRoomId = stayRows[0]?.room_id;
        if (!fromRoomId) throw Object.assign(new Error('Stay not found.'), { status: 404 });
        const newRoomRows = (await conn.execute(
          `SELECT r.id, r.status, rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ? FOR UPDATE`,
          [targetRoomId],
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
          [sr.stay_id, fromRoomId, targetRoomId, toNum(oldRoomRows[0]?.nightly_rate), toNum(newRoom.nightly_rate), sr.description.slice(0, 255), g.user.id],
        );
        await conn.execute(`UPDATE stays SET room_id = ? WHERE id = ?`, [targetRoomId, sr.stay_id]);
        await conn.execute(`UPDATE rooms SET status = 'CLEANING' WHERE id = ?`, [fromRoomId]);
        await conn.execute(`UPDATE rooms SET status = 'OCCUPIED' WHERE id = ?`, [targetRoomId]);
        notes.push('Room transfer completed.');
      }
    }
    return { notes };
  });

  await audit(g.user.id, 'service_request.update', 'service_request', id, { from: sr.status, to: finalStatus, requested_room_id: targetRoomId }, clientIp(req));
  return Response.json({ ok: true, notes: result.notes });
}
