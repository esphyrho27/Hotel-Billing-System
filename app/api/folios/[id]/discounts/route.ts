import { z } from 'zod';
import { guard } from '../../../../../lib/auth';
import { query, queryOne, exec, toNum, round2 } from '../../../../../lib/db';
import { audit, clientIp } from '../../../../../lib/audit';
import { parseBody, routeId, type RouteCtx } from '../../../../../lib/validate';

/** Map discount applies_to → charge categories counted in the base. */
function baseForAppliesTo(appliesTo: string, charges: { category: unknown; amount: unknown }[]): number {
  const cats: Record<string, string[]> = {
    ROOM: ['ROOM'],
    FOOD: ['FOOD'],
    LAUNDRY: ['LAUNDRY'],
    MINIBAR: ['MINIBAR'],
    SERVICE: ['SERVICE'],
    OTHER: ['OTHER'],
  };
  const wanted = appliesTo === 'ALL' ? null : (cats[appliesTo] ?? []);
  return round2(
    charges
      .filter(c => wanted === null || wanted.includes(String(c.category)))
      .reduce((s, c) => s + toNum(c.amount), 0),
  );
}

const applySchema = z.object({
  policy_id: z.number().int().positive(),
  reason: z.string().max(255).optional(),
});

export async function POST(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const parsed = parseBody(applySchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const folio = await queryOne<{ status: string }>(`SELECT status FROM folios WHERE id = ?`, [id]);
  if (!folio) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  if (folio.status !== 'OPEN') return Response.json({ error: `Cannot discount a ${folio.status} folio.` }, { status: 409 });

  const policy = await queryOne<{
    id: number; name: string; category: string; discount_type: string; discount_value: unknown;
    applies_to: string; starts_at: string | null; expires_at: string | null;
    min_amount: unknown; max_discount: unknown; combinable: number; requires_manager: number; active: number;
  }>(`SELECT * FROM discount_policies WHERE id = ?`, [parsed.data.policy_id]);
  if (!policy || !policy.active) return Response.json({ error: 'Discount policy not found or inactive.' }, { status: 404 });

  const now = await queryOne<{ now: string }>(`SELECT DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS now`);
  const nowStr = now?.now ?? '';
  if (policy.starts_at && String(policy.starts_at) > nowStr) {
    return Response.json({ error: 'This discount is not active yet.' }, { status: 422 });
  }
  if (policy.expires_at && String(policy.expires_at) < nowStr) {
    return Response.json({ error: 'This discount has expired.' }, { status: 422 });
  }

  const charges = await query<{ category: unknown; amount: unknown }>(
    `SELECT category, amount FROM charges WHERE folio_id = ?`,
    [id],
  );
  const base = baseForAppliesTo(policy.applies_to, charges);
  if (base < toNum(policy.min_amount)) {
    return Response.json(
      { error: `Minimum eligible amount is ₱${toNum(policy.min_amount).toFixed(2)}; this folio has ₱${base.toFixed(2)} eligible.` },
      { status: 422 },
    );
  }

  if (!policy.combinable) {
    const existing = await queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM applied_discounts WHERE folio_id = ? AND status = 'APPLIED'`,
      [id],
    );
    if (existing && Number(existing.n) > 0) {
      return Response.json({ error: 'This discount cannot be combined with another applied discount.' }, { status: 409 });
    }
  }

  let amount: number;
  if (policy.discount_type === 'PERCENT') {
    amount = round2((base * toNum(policy.discount_value)) / 100);
    if (policy.max_discount !== null && policy.max_discount !== undefined) {
      amount = Math.min(amount, toNum(policy.max_discount));
    }
  } else {
    amount = Math.min(toNum(policy.discount_value), base);
  }
  if (amount <= 0) return Response.json({ error: 'Discount amount is zero.' }, { status: 422 });

  const needsApproval = !!policy.requires_manager && g.user.role !== 'admin' && g.user.role !== 'manager';
  const status = needsApproval ? 'PENDING' : 'APPLIED';

  const { insertId } = await exec(
    `INSERT INTO applied_discounts
      (folio_id, policy_id, name, category, discount_type, discount_value, amount, status, reason, applied_by, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, policy.id, policy.name, policy.category, policy.discount_type, toNum(policy.discount_value),
      amount, status, parsed.data.reason?.trim() || null, g.user.id,
      needsApproval ? null : g.user.id,
      needsApproval ? null : nowStr,
    ],
  );
  await audit(g.user.id, needsApproval ? 'discount.request' : 'discount.apply', 'discount', insertId, { folio_id: id, amount, status }, clientIp(req));
  return Response.json(
    { ok: true, id: insertId, amount, status, pendingApproval: needsApproval },
    { status: 201 },
  );
}

const decisionSchema = z.object({
  discount_id: z.number().int().positive(),
  action: z.enum(['approve', 'reject']),
});

/** Manager/admin approve or reject a PENDING discount. */
export async function PATCH(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }
  const parsed = parseBody(decisionSchema, await req.json().catch(() => null));
  if (!parsed.ok) return parsed.response;

  const d = await queryOne<{ status: string; folio_id: number }>(
    `SELECT status, folio_id FROM applied_discounts WHERE id = ?`,
    [parsed.data.discount_id],
  );
  if (!d || Number(d.folio_id) !== id) return Response.json({ error: 'Discount not found on this folio.' }, { status: 404 });
  if (d.status !== 'PENDING') return Response.json({ error: `Discount is already ${d.status}.` }, { status: 409 });

  const folio = await queryOne<{ status: string }>(`SELECT status FROM folios WHERE id = ?`, [id]);
  if (!folio || folio.status !== 'OPEN') return Response.json({ error: 'Folio is not open.' }, { status: 409 });

  const next = parsed.data.action === 'approve' ? 'APPROVED' : 'REJECTED';
  // Approved discounts count toward the balance, so normalize APPROVED → APPLIED.
  const finalStatus = next === 'APPROVED' ? 'APPLIED' : 'REJECTED';
  await exec(
    `UPDATE applied_discounts SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?`,
    [finalStatus, g.user.id, parsed.data.discount_id],
  );
  await audit(g.user.id, `discount.${parsed.data.action}`, 'discount', parsed.data.discount_id, { folio_id: id }, clientIp(req));
  return Response.json({ ok: true, status: finalStatus });
}
