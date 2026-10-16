import { guard } from '../../../../lib/auth';
import { getFolioDetail } from '../../../../lib/folio';
import { queryOne } from '../../../../lib/db';
import { routeId, type RouteCtx } from '../../../../lib/validate';

/** Stay detail: stay + room + folio + charges/payments/discounts + totals. */
export async function GET(_req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const stay = await queryOne<Record<string, unknown>>(
    `SELECT s.*, r.room_number, r.status AS room_status, rt.name AS type_name, rt.nightly_rate, rt.capacity,
            u.username AS created_by_name
     FROM stays s
     JOIN rooms r ON r.id = s.room_id
     JOIN room_types rt ON rt.id = r.room_type_id
     LEFT JOIN users u ON u.id = s.created_by
     WHERE s.id = ?`,
    [id],
  );
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  const folioRow = await queryOne<{ id: number }>(`SELECT id FROM folios WHERE stay_id = ?`, [id]);
  const detail = folioRow ? await getFolioDetail(folioRow.id) : null;
  return Response.json({ stay, folio: detail?.folio ?? null, room: detail?.room ?? null, charges: detail?.charges ?? [], payments: detail?.payments ?? [], discounts: detail?.discounts ?? [], totals: detail?.totals ?? null });
}
