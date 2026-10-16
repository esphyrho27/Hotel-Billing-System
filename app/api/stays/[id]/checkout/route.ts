import { guard } from '../../../../../lib/auth';
import { queryOne, withTransaction, toNum, round2 } from '../../../../../lib/db';
import { getFolioDetail, getVatRate, vatInclusivePortion } from '../../../../../lib/folio';
import { audit, clientIp } from '../../../../../lib/audit';
import { routeId, type RouteCtx } from '../../../../../lib/validate';

/**
 * Finalize checkout. Requires zero balance. In a transaction:
 * folio → PAID, stay → CHECKED_OUT, room → CLEANING, checkout_records row.
 */
export async function POST(req: Request, ctx: RouteCtx) {
  const g = await guard(['admin', 'manager', 'cashier']);
  if (!g.ok) return g.response;
  let id: number;
  try {
    id = await routeId(ctx);
  } catch (e) {
    return e as Response;
  }

  const stay = await queryOne<{
    id: number; status: string; room_id: number; checkin_at: string; planned_checkout: string;
  }>(`SELECT id, status, room_id, checkin_at, planned_checkout FROM stays WHERE id = ?`, [id]);
  if (!stay) return Response.json({ error: 'Stay not found.' }, { status: 404 });
  if (stay.status !== 'ACTIVE') return Response.json({ error: 'Stay is not active.' }, { status: 409 });

  const folioRow = await queryOne<{ id: number; status: string; folio_number: string }>(
    `SELECT id, status, folio_number FROM folios WHERE stay_id = ?`,
    [id],
  );
  if (!folioRow) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  if (folioRow.status !== 'OPEN') return Response.json({ error: 'Folio is not open.' }, { status: 409 });

  const detail = await getFolioDetail(folioRow.id);
  if (!detail) return Response.json({ error: 'Folio not found.' }, { status: 404 });
  const t = detail.totals;
  if (t.balance > 0.005) {
    return Response.json(
      { error: `Cannot check out with an outstanding balance of ₱${t.balance.toFixed(2)}. Record payment first.`, balance: t.balance },
      { status: 409 },
    );
  }
  if (t.balance < -0.005) {
    return Response.json(
      { error: `Folio is overpaid by ₱${Math.abs(t.balance).toFixed(2)}. Issue a refund before checkout.`, balance: t.balance },
      { status: 409 },
    );
  }

  const vatRate = await getVatRate();
  const net = round2(t.chargesTotal - t.discountTotal);
  const vatAmount = vatInclusivePortion(net, vatRate);

  const checkinDate = new Date(String(stay.checkin_at).slice(0, 10) + 'T00:00:00');
  const plannedDate = new Date(String(stay.planned_checkout).slice(0, 10) + 'T00:00:00');
  const nights = Math.max(1, Math.round((plannedDate.getTime() - checkinDate.getTime()) / 86400000));

  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');

  const receipt = await withTransaction(async conn => {
    await conn.execute(`UPDATE folios SET status = 'PAID' WHERE id = ? AND status = 'OPEN'`, [folioRow.id]);
    await conn.execute(`UPDATE stays SET status = 'CHECKED_OUT', actual_checkout = ? WHERE id = ? AND status = 'ACTIVE'`, [nowSql, id]);
    await conn.execute(`UPDATE rooms SET status = 'CLEANING' WHERE id = ?`, [stay.room_id]);
    const [cr] = await conn.execute(
      `INSERT INTO checkout_records
        (stay_id, folio_id, scheduled_checkout_at, actual_checkout_at, nights_stayed, unused_nights,
         charges_total, discount_total, vat_amount, final_amount, payments_received, refunds_completed, finalized_by)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, ?)`,
      [id, folioRow.id, stay.planned_checkout, nowSql, nights, t.chargesTotal, t.discountTotal, vatAmount, net, t.paymentsTotal, g.user.id],
    );
    return { checkoutRecordId: Number((cr as { insertId: number }).insertId) };
  });

  await audit(g.user.id, 'stay.checkout', 'stay', id, { folio_number: folioRow.folio_number, final_amount: net }, clientIp(req));

  const fresh = await getFolioDetail(folioRow.id);
  return Response.json({
    ok: true,
    checkoutRecordId: receipt.checkoutRecordId,
    folio_number: folioRow.folio_number,
    nights,
    vatRate,
    vatAmount,
    totals: fresh?.totals ?? t,
    charges: fresh?.charges ?? [],
    payments: fresh?.payments ?? [],
    discounts: fresh?.discounts ?? [],
  });
}
