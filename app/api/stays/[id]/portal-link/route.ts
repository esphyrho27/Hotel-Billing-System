import { guard } from '../../../../../lib/auth';
import { queryOne } from '../../../../../lib/db';
import { audit, clientIp } from '../../../../../lib/audit';
import { createPortalToken, getActivePortalLink, portalExpiry } from '../../../../../lib/portal';
import { routeId, type RouteCtx } from '../../../../../lib/validate';

/** Link status for a stay (raw token is never recoverable — only whether one is active). */
export async function GET(_req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const stay = await queryOne<{ planned_checkout: string; status: string }>(
    `SELECT planned_checkout, status FROM stays WHERE id = ?`,
    [id],
  );
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  const link = await getActivePortalLink(id);
  return Response.json({ hasLink: !!link, expires_at: link?.expires_at ?? null, stay_status: stay.status });
}

/** Generate (or regenerate) the guest portal link. Old links are revoked. */
export async function POST(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const stay = await queryOne<{ planned_checkout: string; status: string }>(
    `SELECT planned_checkout, status FROM stays WHERE id = ?`,
    [id],
  );
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') {
    return Response.json({ error: 'Portal links are only available for active stays.' }, { status: 409 });
  }
  const token = await createPortalToken(id, portalExpiry(String(stay.planned_checkout).slice(0, 10)));
  await audit(g.user.id, 'portal_link.regenerate', 'stay', id, undefined, clientIp(req));
  return Response.json({ ok: true, token }, { status: 201 });
}
