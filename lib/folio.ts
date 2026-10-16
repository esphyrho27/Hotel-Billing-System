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
import { query, queryOne, toNum, round2 } from './db';

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
