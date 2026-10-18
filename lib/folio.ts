/**
 * Folio detail + money totals, shared by folio/checkout API routes and pages.
 *
 * Money model:
 *   chargesTotal   = SUM(charges.amount)
 *   discountTotal  = SUM(applied_discounts.amount WHERE status = 'APPLIED')
 *   paymentsTotal  = SUM(payments.amount)
 *   balance        = chargesTotal - discountTotal - paymentsTotal
 * VAT (billing_policies.VAT_RATE, default 12) is shown as an informational
 * "VAT-inclusive" line on the receipt; it does not change the balance.
 */
import { query, queryOne, exec, toNum, round2 } from './db';

export interface FolioTotals {
  chargesTotal: number;
  discountTotal: number;
  paymentsTotal: number;
  balance: number;
}

export interface FolioDetail {
  folio: Record<string, unknown>;
  stay: Record<string, unknown> | null;
  room: Record<string, unknown> | null;
  charges: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  discounts: Record<string, unknown>[];
  totals: FolioTotals;
}

export function computeTotals(
  charges: Record<string, unknown>[],
  discounts: Record<string, unknown>[],
  payments: Record<string, unknown>[],
): FolioTotals {
  const chargesTotal = round2(charges.reduce((s, c) => s + toNum(c.amount), 0));
  const discountTotal = round2(
    discounts.filter(d => d.status === 'APPLIED').reduce((s, d) => s + toNum(d.amount), 0),
  );
  const paymentsTotal = round2(payments.reduce((s, p) => s + toNum(p.amount), 0));
  return { chargesTotal, discountTotal, paymentsTotal, balance: round2(chargesTotal - discountTotal - paymentsTotal) };
}

export async function getFolioDetail(folioId: number): Promise<FolioDetail | null> {
  const folio = await queryOne<Record<string, unknown>>(`SELECT * FROM folios WHERE id = ?`, [folioId]);
  if (!folio) return null;
  const stay = await queryOne<Record<string, unknown>>(`SELECT * FROM stays WHERE id = ?`, [Number(folio.stay_id)]);
  let room: Record<string, unknown> | null = null;
  if (stay) {
    room = await queryOne<Record<string, unknown>>(
      `SELECT r.*, rt.name AS type_name, rt.nightly_rate
       FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id
       WHERE r.id = ?`,
      [Number(stay.room_id)],
    );
  }
  const charges = await query<Record<string, unknown>>(
    `SELECT c.*, u.username AS created_by_name FROM charges c
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.folio_id = ? ORDER BY c.created_at ASC, c.id ASC`,
    [folioId],
  );
  const payments = await query<Record<string, unknown>>(
    `SELECT p.*, u.username AS received_by_name FROM payments p
     LEFT JOIN users u ON u.id = p.received_by
     WHERE p.folio_id = ? ORDER BY p.created_at ASC, p.id ASC`,
    [folioId],
  );
  const discounts = await query<Record<string, unknown>>(
    `SELECT * FROM applied_discounts WHERE folio_id = ? ORDER BY created_at ASC, id ASC`,
    [folioId],
  );
  return { folio, stay, room, charges, payments, discounts, totals: computeTotals(charges, discounts, payments) };
}

export async function getVatRate(): Promise<number> {
  const row = await queryOne<{ policy_value: string }>(
    `SELECT policy_value FROM billing_policies WHERE policy_key = 'VAT_RATE'`,
  );
  const n = row ? parseFloat(row.policy_value) : NaN;
  return Number.isFinite(n) ? n : 12;
}

/** VAT shown as an informational VAT-inclusive portion of the net amount. */
export function vatInclusivePortion(netAmount: number, vatRate: number): number {
  return round2((netAmount * vatRate) / (100 + vatRate));
}

/**
 * Post missing nightly ROOM charges for a stay (one per night at the room's
 * nightly rate). Idempotent: each night uses key `roomchg:{stayId}:{YYYY-MM-DD}`,
 * so already-posted nights are skipped. Only runs on ACTIVE stays / OPEN folios.
 * Returns { nights, posted }.
 */
export async function postMissingRoomCharges(
  stayId: number,
  userId: number | null,
): Promise<{ nights: number; posted: number }> {
  const stay = await queryOne<{
    id: number; status: string; checkin_at: string; planned_checkout: string; room_id: number;
  }>(`SELECT id, status, checkin_at, planned_checkout, room_id FROM stays WHERE id = ?`, [stayId]);
  if (!stay || stay.status !== 'ACTIVE') return { nights: 0, posted: 0 };
  const folio = await queryOne<{ id: number; status: string }>(`SELECT id, status FROM folios WHERE stay_id = ?`, [stayId]);
  if (!folio || folio.status !== 'OPEN') return { nights: 0, posted: 0 };
  const room = await queryOne<{ room_number: string; nightly_rate: unknown }>(
    `SELECT r.room_number, rt.nightly_rate FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id WHERE r.id = ?`,
    [stay.room_id],
  );
  if (!room) return { nights: 0, posted: 0 };
  const rate = toNum(room.nightly_rate);

  const checkinDate = new Date(String(stay.checkin_at).slice(0, 10) + 'T00:00:00');
  const plannedDate = new Date(String(stay.planned_checkout).slice(0, 10) + 'T00:00:00');
  const nights = Math.max(1, Math.round((plannedDate.getTime() - checkinDate.getTime()) / 86400000));

  let posted = 0;
  for (let i = 0; i < nights; i++) {
    const d = new Date(checkinDate);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const key = `roomchg:${stayId}:${ds}`;
    const dup = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM charges WHERE idempotency_key = ?`, [key]);
    if (dup && Number(dup.n) > 0) continue;
    await exec(
      `INSERT INTO charges (folio_id, category, description, quantity, unit_price, amount, idempotency_key, created_by)
       VALUES (?, 'ROOM', ?, 1, ?, ?, ?, ?)`,
      [folio.id, `Room charge — ${ds} (Room ${room.room_number} @ ₱${rate.toFixed(2)}/night)`, rate, round2(rate), key, userId],
    );
    posted++;
  }
  return { nights, posted };
}

/**
 * Auto-reconcile nightly ROOM charges on early checkout.
 *
 * Check-in posts ALL planned nights up front (idempotent keys
 * `roomchg:{stayId}:{YYYY-MM-DD}`). When a guest leaves before the planned
 * checkout date, nights on/after the actual checkout date were never stayed,
 * so this posts a single negative ADJUSTMENT offsetting them. The original
 * charges are kept for the audit trail; the adjustment is idempotent via
 * `roomadj:{stayId}:{YYYY-MM-DD}` (the actual checkout date).
 *
 * Only touches auto-posted nightly charges (category ROOM with a matching
 * idempotency key) — manually posted charges are left for staff to handle.
 * Returns { adjusted, unusedNights, adjustedAmount, actualNights, plannedNights }.
 */
export async function reconcileEarlyCheckout(
  stayId: number,
  userId: number | null,
): Promise<{
  adjusted: boolean;
  unusedNights: string[];
  adjustedAmount: number;
  actualNights: number;
  plannedNights: number;
}> {
  const stay = await queryOne<{
    id: number; status: string; checkin_at: string; planned_checkout: string; room_id: number;
  }>(`SELECT id, status, checkin_at, planned_checkout, room_id FROM stays WHERE id = ?`, [stayId]);
  const empty = { adjusted: false, unusedNights: [] as string[], adjustedAmount: 0, actualNights: 0, plannedNights: 0 };
  if (!stay || stay.status !== 'ACTIVE') return empty;
  const folio = await queryOne<{ id: number; status: string }>(`SELECT id, status FROM folios WHERE stay_id = ?`, [stayId]);
  if (!folio || folio.status !== 'OPEN') return empty;

  const todayStr = new Date().toISOString().slice(0, 10);
  const checkinDate = new Date(String(stay.checkin_at).slice(0, 10) + 'T00:00:00');
  const plannedDate = new Date(String(stay.planned_checkout).slice(0, 10) + 'T00:00:00');
  const todayDate = new Date(todayStr + 'T00:00:00');
  const plannedNights = Math.max(1, Math.round((plannedDate.getTime() - checkinDate.getTime()) / 86400000));
  const actualNights = Math.max(1, Math.round((todayDate.getTime() - checkinDate.getTime()) / 86400000));
  const base = { ...empty, actualNights, plannedNights };
  if (actualNights >= plannedNights) return base;

  // Idempotency: one adjustment per stay per actual checkout date.
  const adjKey = `roomadj:${stayId}:${todayStr}`;
  const adjDup = await queryOne<{ n: number }>(`SELECT COUNT(*) AS n FROM charges WHERE idempotency_key = ?`, [adjKey]);
  if (adjDup && Number(adjDup.n) > 0) return base;

  const prefix = `roomchg:${stayId}:`;
  const posted = await query<{ idempotency_key: string; amount: unknown }>(
    `SELECT idempotency_key, amount FROM charges WHERE folio_id = ? AND category = 'ROOM' AND idempotency_key LIKE ?`,
    [folio.id, `${prefix}%`],
  );
  // Nights are keyed by date; the checkout day's own night was stayed, so only
  // nights strictly after the checkout date are unused.
  const unused = posted.filter(c => String(c.idempotency_key).slice(prefix.length) > todayStr);
  const adjustedAmount = round2(unused.reduce((s, c) => s + toNum(c.amount), 0));
  if (adjustedAmount <= 0) return base;

  const unusedNights = unused.map(c => String(c.idempotency_key).slice(prefix.length)).sort();
  await exec(
    `INSERT INTO charges (folio_id, category, description, quantity, unit_price, amount, idempotency_key, created_by)
     VALUES (?, 'ADJUSTMENT', ?, 1, ?, ?, ?, ?)`,
    [
      folio.id,
      `Early checkout adjustment — removed ${unusedNights.length} unused night(s): ${unusedNights.join(', ')}`,
      -adjustedAmount,
      -adjustedAmount,
      adjKey,
      userId,
    ],
  );
  return { ...base, adjusted: true, unusedNights, adjustedAmount };
}
