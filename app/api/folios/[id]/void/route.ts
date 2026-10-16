import { z } from 'zod';
import { guard } from '../../../../../lib/auth';
import { queryOne, exec } from '../../../../../lib/db';
import { audit, clientIp } from '../../../../../lib/audit';
import { parseBody, routeId, type RouteCtx } from '../../../../../lib/validate';

const schema = z.object({ reason: z.string().min(1).max(500) });

/** Void an OPEN folio with no payments (manager/admin). Use refunds for paid folios. */
export async function POST(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const folio = await queryOne<{ status: string; stay_id: number }>(
    `SELECT status, stay_id FROM folios WHERE id = ?`,
    [id],
  );
  if (!folio) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  if (folio.status !== 'OPEN') return Response.json({ error: `Folio is already ${folio.status}.` }, { status: 409 });

  const payCount = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM payments WHERE folio_id = ?`, [id]);
  if (payCount && Number(payCount.n) > 0) {
    return Response.json({ error: 'Folio has payments — void is not allowed. Process a refund instead.' }, { status: 409 });
  }

  await exec(`UPDATE folios SET status = 'VOID' WHERE id = ?`, [id]);
  await audit(g.user.id, 'folio.void', 'folio', id, { reason: parsed.data.reason }, clientIp(req));
  return Response.json({ ok: true });
}
