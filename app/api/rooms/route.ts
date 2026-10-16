import { z } from 'zod';
import { guard } from '../../../lib/auth';
import { query, exec } from '../../../lib/db';
import { audit, clientIp } from '../../../lib/audit';
import { parseBody } from '../../../lib/validate';

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const rooms = await query(
    `SELECT r.id, r.room_number, r.room_type_id, r.floor_number, r.status,
            rt.name AS type_name, rt.nightly_rate, rt.capacity
     FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
     ORDER BY r.floor_number ASC, r.room_number ASC`,
  );
  return Response.json({ rooms });
}

const createSchema = z.object({
  room_number: z.string().min(1).max(20),
  room_type_id: z.number().int().positive(),
  floor_number: z.number().int().min(0).max(99),
});

export async function POST(req: Request) {
  const g = await guard(['admin', 'manager']);
  if (!g.ok) return g.response;
  const parsed = parseBody(createSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { room_number, room_type_id, floor_number } = parsed.data;
  try {
    const { insertId } = await exec(
      `INSERT INTO rooms (room_number, room_type_id, floor_number, status) VALUES (?, ?, ?, 'AVAILABLE')`,
      [room_number.trim(), room_type_id, floor_number],
    );
    await audit(g.user.id, 'room.create', 'room', insertId, { room_number }, clientIp(req));
    return Response.json({ ok: true, id: insertId }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Room number already exists.' }, { status: 409 });
    }
    throw e;
  }
}
