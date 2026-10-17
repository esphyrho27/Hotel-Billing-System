import { z } from 'zod';
import { exec, queryOne } from '../../../../../lib/db';
import { newRequestCode } from '../../../../../lib/codes';
import { resolvePortalToken } from '../../../../../lib/portal';
import { parseBody } from '../../../../../lib/validate';
import type { RouteCtx } from '../../../../../lib/validate';

type Ctx = RouteCtx<{ token: string }>;

const SERVICE_TYPES = ['HOUSEKEEPING', 'FOOD_BEVERAGE', 'MAINTENANCE', 'FRONT_DESK', 'OTHER'] as const;

const schema = z.object({
  // Either pick from the catalog…
  catalog_id: z.number().int().positive().optional(),
  // …or describe a custom request.
  service_type: z.enum(SERVICE_TYPES).default('OTHER'),
  description: z.string().min(1).max(500),
  // Guests can also ask for a room change; staff assigns the target room.
  request_kind: z.enum(['SERVICE', 'ROOM_TRANSFER']).default('SERVICE'),
});

/**
 * Guest creates a service request. No staff session — portal token is the credential.
 * Catalog items carry their price (chargeable); custom requests are non-chargeable
 * until staff prices them.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const resolved = await resolvePortalToken(token ?? '');
  if (!resolved) {
    return Response.json({ error: 'This link is invalid or has expired. Please ask the front desk for a new link.' }, { status: 404 });
  }
  const stay = await queryOne<{ status: string }>(`SELECT status FROM stays WHERE id = ?`, [resolved.stay_id]);
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') {
    return Response.json({ error: 'This stay is no longer active — new requests cannot be placed.' }, { status: 409 });
  }

  const parsed = parseBody(schema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;
  const { catalog_id, service_type, description, request_kind } = parsed.data;

  if (request_kind === 'ROOM_TRANSFER') {
    // Room change: guest gives a reason; staff picks the target room later.
    const reason = description.trim();
    if (!reason) return Response.json({ error: 'Please tell us why you would like to change rooms.' }, { status: 400 });
    const code = newRequestCode();
    const { insertId } = await exec(
      `INSERT INTO service_requests
         (stay_id, request_code, service_type, request_kind, description, status, chargeable, price)
       VALUES (?, ?, 'FRONT_DESK', 'ROOM_TRANSFER', ?, 'NEW', 0, 0)`,
      [resolved.stay_id, code, reason],
    );
    return Response.json({ ok: true, id: insertId, request_code: code, request_kind: 'ROOM_TRANSFER' }, { status: 201 });
  }

  let finalType: string = service_type ?? 'OTHER';
  let finalDesc = description.trim();
  let chargeable = false;
  let price = 0;

  if (catalog_id) {
    const item = await queryOne<{ name: string; category: string; price: unknown }>(
      `SELECT name, category, price FROM service_catalog WHERE id = ? AND active = 1`,
      [catalog_id],
    );
    if (!item) return Response.json({ error: 'Menu item not found.' }, { status: 404 });
    finalDesc = `${item.name} — ${finalDesc}`;
    if (['HOUSEKEEPING', 'FOOD_BEVERAGE', 'MAINTENANCE', 'FRONT_DESK', 'OTHER'].includes(item.category)) {
      finalType = item.category as (typeof SERVICE_TYPES)[number];
    }
    const p = Number(item.price ?? 0);
    if (Number.isFinite(p) && p > 0) {
      chargeable = true;
      price = Math.round(p * 100) / 100;
    }
  }

  const code = newRequestCode();
  const { insertId } = await exec(
    `INSERT INTO service_requests
       (stay_id, request_code, service_type, request_kind, description, status, chargeable, price)
     VALUES (?, ?, ?, 'SERVICE', ?, 'NEW', ?, ?)`,
    [resolved.stay_id, code, finalType, finalDesc, chargeable ? 1 : 0, price],
  );
  return Response.json({ ok: true, id: insertId, request_code: code, chargeable, price }, { status: 201 });
}
