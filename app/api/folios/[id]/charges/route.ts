import { z } from 'zod';
import { guard } from '../../../../../lib/auth';
import { queryOne, exec, round2 } from '../../../../../lib/db';
import { audit, clientIp } from '../../../../../lib/audit';
import { newIdempotencyKey } from '../../../../../lib/codes';
import { parseBody, routeId, type RouteCtx } from '../../../../../lib/validate';

const CATEGORIES = [
  'ROOM', 'FOOD', 'LAUNDRY', 'MINIBAR', 'SERVICE', 'OTHER', 'ADJUSTMENT',
  'DAMAGE', 'MISSING_ITEM', 'EXTRA_PERSON', 'LATE_CHECKOUT', 'ROOM_SERVICE',
] as const;

const schema = z.object({
  category: z.enum(CATEGORIES),
  description: z.string().min(1).max(255),
  quantity: z.number().positive().max(100000),
  unit_price: z.number().min(0).max(10000000),
  idempotency_key: z.string().max(100).optional(),
  service_request_id: z.number().int().positive().optional(),
});

export async function POST(req: Request, ctx: RouteCtx) {
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

  const folio = await queryOne<{ status: string }>(`SELECT status FROM folios WHERE id = ?`, [id]);
  if (!folio) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  if (folio.status !== 'OPEN') {
    return Response.json({ error: `Cannot add charges to a ${folio.status} folio.` }, { status: 409 });
  }

  const { category, description, quantity, unit_price, service_request_id } = parsed.data;
  const idemKey = parsed.data.idempotency_key ?? newIdempotencyKey();
  const amount = round2(quantity * unit_price);

  try {
    const { insertId } = await exec(
      `INSERT INTO charges (folio_id, category, description, quantity, unit_price, amount, service_request_id, idempotency_key, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, category, description.trim(), quantity, unit_price, amount, service_request_id ?? null, idemKey, g.user.id],
    );
    await audit(g.user.id, 'charge.create', 'charge', insertId, { folio_id: id, category, amount }, clientIp(req));
    return Response.json({ ok: true, id: insertId, amount }, { status: 201 });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'ER_DUP_ENTRY') {
      return Response.json({ error: 'Duplicate charge (idempotency key already used).', duplicate: true }, { status: 409 });
    }
    throw e;
  }
}
