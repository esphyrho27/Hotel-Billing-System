import { guard } from '../../../../lib/auth';
import { getFolioDetail } from '../../../../lib/folio';
import { routeId, type RouteCtx } from '../../../../lib/validate';

export async function GET(_req: Request, ctx: RouteCtx) {
  const g = await guard();
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const detail = await getFolioDetail(id);
  if (!detail) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  return Response.json(detail);
}
