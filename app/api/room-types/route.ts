import { z } from 'zod';
import { guard } from '../../../lib/auth';
import { query, exec } from '../../../lib/db';
import { audit, clientIp } from '../../../lib/audit';
import { parseBody } from '../../../lib/validate';

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const types = await query(`SELECT * FROM room_types ORDER BY nightly_rate ASC`);
  return Response.json({ roomTypes: types });
}

const schema = z.object({
  name: z.string().min(1).max(80),
  nightly_rate: z.number().min(0).max(10000000),
  capacity: z.number().int().min(1).max(20),
});

export async function POST(req: Request) {
  const g = await guard(['admin', 'manager']);
  if (!g.ok) return g.response;
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { name, nightly_rate, capacity } = parsed.data;
  try {
    const { insertId } = await exec(
      `INSERT INTO room_types (name, nightly_rate, capacity) VALUES (?, ?, ?)`,
      [name.trim(), nightly_rate, capacity],
    );
    await audit(g.user.id, 'room_type.create', 'room_type', insertId, { name }, clientIp(req));
    return Response.json({ ok: true, id: insertId }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Room type name already exists.' }, { status: 409 });
    }
    throw e;
  }
}
