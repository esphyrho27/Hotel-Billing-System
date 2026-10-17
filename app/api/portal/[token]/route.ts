import { query, queryOne } from '../../../../lib/db';
import { getFolioDetail } from '../../../../lib/folio';
import { getStayRequests, resolvePortalToken } from '../../../../lib/portal';
import type { RouteCtx } from '../../../../lib/validate';

type Ctx = RouteCtx<{ token: string }>;

/**
 * Public guest portal data. No staff session required — the unguessable
 * portal token is the credential. Returns only this stay's data.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const resolved = await resolvePortalToken(token ?? '');
  if (!resolved) {
    return Response.json({ error: 'This link is invalid or has expired. Please ask the front desk for a new link.' }, { status: 404 });
  }
  const stayId = resolved.stay_id;

  const stay = await queryOne<Record<string, unknown>>(
    `SELECT s.id, s.stay_code, s.guest_count, s.checkin_at, s.planned_checkout, s.actual_checkout, s.status,
            r.room_number, rt.name AS type_name, rt.nightly_rate
     FROM stays s
     JOIN rooms r ON r.id = s.room_id
     JOIN room_types rt ON rt.id = r.room_type_id
     WHERE s.id = ?`,
    [stayId],
  );
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });

  const folioRow = await queryOne<{ id: number }>(`SELECT id FROM folios WHERE stay_id = ?`, [stayId]);
  const detail = folioRow ? await getFolioDetail(folioRow.id) : null;

  const catalog = await query(
    `SELECT id, name, category, description, price FROM service_catalog WHERE active = 1 ORDER BY category, name`,
  );
  const requests = await getStayRequests(stayId);

  return Response.json({
    stay: {
      stay_code: stay.stay_code,
      room_number: stay.room_number,
      type_name: stay.type_name,
      nightly_rate: stay.nightly_rate,
      guest_count: stay.guest_count,
      checkin_at: stay.checkin_at,
      planned_checkout: stay.planned_checkout,
      actual_checkout: stay.actual_checkout,
      status: stay.status,
    },
    folio: detail
      ? {
          folio_number: detail.folio.folio_number,
          status: detail.folio.status,
          charges: detail.charges,
          payments: detail.payments,
          discounts: detail.discounts,
          totals: detail.totals,
        }
      : null,
    catalog,
    requests,
    link_expires_at: resolved.expires_at,
  });
}
