import { z } from 'zod';
import { guard } from '../../../../../lib/auth';
import { queryOne, exec, round2 } from '../../../../../lib/db';
import { audit, clientIp } from '../../../../../lib/audit';
import { newReceiptNumber, newIdempotencyKey } from '../../../../../lib/codes';
import { parseBody, routeId, type RouteCtx } from '../../../../../lib/validate';

const METHODS = ['CASH', 'CARD', 'GCASH', 'BANK_TRANSFER', 'MAYA', 'QR_PH', 'OTHER'] as const;

const schema = z.object({
  method: z.enum(METHODS),
  amount: z.number().positive().max(10000000),
  received_amount: z.number().positive().max(10000000),
  reference_note: z.string().max(120).optional(),
});

export async function POST(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'cashier']);
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
    return Response.json({ error: `Cannot take payments on a ${folio.status} folio.` }, { status: 409 });
  }

  const { method, amount, received_amount, reference_note } = parsed.data;
  if (received_amount < amount) {
    return Response.json({ error: 'Amount tendered is less than the payment amount.' }, { status: 422 });
  }
  const change = round2(received_amount - amount);

  const { insertId } = await exec(
    `INSERT INTO payments (folio_id, receipt_number, method, amount, received_amount, change_amount, reference_note, received_by, idempotency_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, newReceiptNumber(), method, round2(amount), round2(received_amount), change, reference_note?.trim() || null, g.user.id, newIdempotencyKey()],
  );
  await audit(g.user.id, 'payment.create', 'payment', insertId, { folio_id: id, method, amount }, clientIp(req));
  return Response.json({ ok: true, id: insertId, change_amount: change }, { status: 201 });
}
