import { z } from 'zod';
import { guard } from '../../../lib/auth';
import { query, queryOne, exec } from '../../../lib/db';
import { audit, clientIp } from '../../../lib/audit';
import { newRequestCode } from '../../../lib/codes';
import { parseBody } from '../../../lib/validate';

export async function GET(req: Request) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'service']);
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const where = status ? `WHERE sr.status = ?` : '';
  const params = status ? [status] : [];
  const items = await query(
    `SELECT sr.*, s.stay_code, r.room_number, rr.room_number AS requested_room_number, u.username AS completed_by_name
     FROM service_requests sr
     JOIN stays s ON s.id = sr.stay_id
     JOIN rooms r ON r.id = s.room_id
     LEFT JOIN rooms rr ON rr.id = sr.requested_room_id
     LEFT JOIN users u ON u.id = sr.completed_by
     ${where}
     ORDER BY sr.created_at DESC, sr.id DESC`,
    params,
  );
  return Response.json({ requests: items });
}

const SERVICE_TYPES = ['HOUSEKEEPING', 'FOOD_BEVERAGE', 'MAINTENANCE', 'FRONT_DESK', 'OTHER'] as const;

const schema = z.object({
  stay_id: z.number().int().positive(),
  service_type: z.enum(SERVICE_TYPES),
  request_kind: z.enum(['SERVICE', 'ROOM_TRANSFER']).default('SERVICE'),
  description: z.string().min(1).max(500),
  chargeable: z.boolean().default(false),
  price: z.number().min(0).max(10000000).default(0),
  requested_room_id: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'service']);
  if (!g.ok) return g.response;
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { stay_id, service_type, request_kind, description, chargeable, price, requested_room_id } = parsed.data;

  const stay = await queryOne<{ status: string }>(`SELECT status FROM stays WHERE id = ?`, [stay_id]);
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') return Response.json({ error: 'Stay is not active.' }, { status: 409 });

  if (request_kind === 'ROOM_TRANSFER') {
    if (!requested_room_id) return Response.json({ error: 'requested_room_id is required for room transfers.' }, { status: 400 });
    const room = await queryOne<{ status: string }>(`SELECT status FROM rooms WHERE id = ?`, [requested_room_id]);
    if (!room) return Response.json({ error: 'Requested room not found.' }, { status: 404 });
    if (room.status !== 'AVAILABLE') return Response.json({ error: `Requested room is ${room.status}.` }, { status: 409 });
  }

  const code = newRequestCode();
  const { insertId } = await exec(
    `INSERT INTO service_requests
      (stay_id, request_code, service_type, request_kind, requested_room_id, description, status, chargeable, price)
     VALUES (?, ?, ?, ?, ?, ?, 'NEW', ?, ?)`,
    [stay_id, code, service_type, request_kind ?? 'SERVICE', requested_room_id ?? null, description.trim(), chargeable ? 1 : 0, Number(price ?? 0)],
  );
  await audit(g.user.id, 'service_request.create', 'service_request', insertId, { request_code: code, request_kind }, clientIp(req));
  return Response.json({ ok: true, id: insertId, request_code: code }, { status: 201 });
}
