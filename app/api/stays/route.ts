import { z } from 'zod';
import { guard } from '../../../lib/auth';
import { query, withTransaction } from '../../../lib/db';
import { newStayCode, newFolioNumber } from '../../../lib/codes';
import { audit, clientIp } from '../../../lib/audit';
import { parseBody } from '../../../lib/validate';

export async function GET(req: Request) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || 'ACTIVE';
  const stays = await query(
    `SELECT s.*, r.room_number, rt.name AS type_name, f.id AS folio_id, f.folio_number, f.status AS folio_status,
            u.username AS created_by_name
     FROM stays s
     JOIN rooms r ON r.id = s.room_id
     JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN folios f ON f.stay_id = s.id
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.status = ?
     ORDER BY s.checkin_at DESC`,
    [status],
  );
  return Response.json({ stays });
}

const checkinSchema = z.object({
  room_id: z.number().int().positive(),
  guest_count: z.number().int().min(1).max(20),
  planned_checkout: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'planned_checkout must be YYYY-MM-DD'),
  checkin_at: z.string().optional(),
});

export async function POST(req: Request) {
  const g = await guard(['admin', 'manager', 'frontdesk']);
  if (!g.ok) return g.response;
  const parsed = parseBody(checkinSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { room_id, guest_count, planned_checkout, checkin_at } = parsed.data;

  try {
    const result = await withTransaction(async conn => {
      const [roomRows] = await conn.execute(`SELECT id, status FROM rooms WHERE id = ? FOR UPDATE`, [room_id]);
      const room = (roomRows as { id: number; status: string }[])[0];
      if (!room) throw Object.assign(new Error('Room not found.'), { status: 404 });
      if (room.status !== 'AVAILABLE') {
        throw Object.assign(new Error(`Room is ${room.status} — only AVAILABLE rooms can be checked in.`), { status: 409 });
      }
      const stayCode = newStayCode();
      const folioNumber = newFolioNumber();
      const checkinAt = checkin_at ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
      const [stayRes] = await conn.execute(
        `INSERT INTO stays (stay_code, room_id, guest_count, checkin_at, planned_checkout, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`,
        [stayCode, room_id, guest_count, checkinAt, planned_checkout, g.user.id],
      );
      const stayId = Number((stayRes as { insertId: number }).insertId);
      const [folioRes] = await conn.execute(
        `INSERT INTO folios (stay_id, folio_number, status) VALUES (?, ?, 'OPEN')`,
        [stayId, folioNumber],
      );
      const folioId = Number((folioRes as { insertId: number }).insertId);
      await conn.execute(`UPDATE rooms SET status = 'OCCUPIED' WHERE id = ?`, [room_id]);
      return { stayId, folioId, stayCode, folioNumber };
    });
    await audit(g.user.id, 'stay.checkin', 'stay', result.stayId, { stay_code: result.stayCode }, clientIp(req));
    return Response.json({ ok: true, ...result }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'status' in e) {
      const err = e as { status?: unknown; message?: unknown };
      const status = typeof err.status === 'number' ? err.status : 500;
      const message = typeof err.message === 'string' ? err.message : 'Request failed.';
      return Response.json({ error: message }, { status });
    }
    throw e;
  }
}
