import { guard } from '../../../lib/auth';
import { query } from '../../../lib/db';

/**
 * GET /api/transactions — unified ledger of all charges and payments.
 * Query: from=YYYY-MM-DD, to=YYYY-MM-DD, type=charge|payment|all (default all).
 * Roles: admin, manager, cashier.
 */
export async function GET(req: Request) {
  const g = await guard(['admin', 'manager', 'cashier']);
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') || from;
  const type = searchParams.get('type') || 'all';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: 'from/to must be YYYY-MM-DD.' }, { status: 400 });
  }

  const parts: string[] = [];
  const params: unknown[] = [];
  if (type === 'all' || type === 'charge') {
    parts.push(`
      SELECT 'charge' AS kind, c.id, c.created_at AS at, c.description AS label,
             c.category AS detail, c.amount,
             f.folio_number, s.stay_code, r.room_number, u.username AS by_user
      FROM charges c
      JOIN folios f ON f.id = c.folio_id
      JOIN stays s ON s.id = f.stay_id
      JOIN rooms r ON r.id = s.room_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE DATE(c.created_at) BETWEEN ? AND ?`);
    params.push(from, to);
  }
  if (type === 'all' || type === 'payment') {
    parts.push(`
      SELECT 'payment' AS kind, p.id, p.created_at AS at,
             CONCAT('Payment · ', p.method, ' · ', p.receipt_number) AS label,
             p.method AS detail, p.amount,
             f.folio_number, s.stay_code, r.room_number, u.username AS by_user
      FROM payments p
      JOIN folios f ON f.id = p.folio_id
      JOIN stays s ON s.id = f.stay_id
      JOIN rooms r ON r.id = s.room_id
      LEFT JOIN users u ON u.id = p.received_by
      WHERE DATE(p.created_at) BETWEEN ? AND ?`);
    params.push(from, to);
  }
  if (parts.length === 0) return Response.json({ error: 'type must be charge, payment or all.' }, { status: 400 });

  const rows = await query(
    `${parts.join(' UNION ALL ')} ORDER BY at DESC, kind ASC, id DESC LIMIT 1000`,
    params as (string | number | boolean | null | Date)[],
  );
  const totals = (rows as { kind: string; amount: unknown }[]).reduce(
    (s, r) => {
      const n = Number(r.amount ?? 0);
      if (r.kind === 'charge') s.charges += n;
      else s.payments += n;
      return s;
    },
    { charges: 0, payments: 0 },
  );
  return Response.json({ from, to, type, count: rows.length, totals, transactions: rows });
}
