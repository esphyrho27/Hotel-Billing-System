import { guard } from '../../../../lib/auth';
import { query, toNum, round2 } from '../../../../lib/db';

/**
 * GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Revenue (payments) by day and by method, occupancy snapshot, open-folio balances.
 */
export async function GET(req: Request) {
  const g = await guard(['admin', 'manager', 'cashier']);
  if (!g.ok) return g.response;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') || new Date().toISOString().slice(0, 10);
  const to = searchParams.get('to') || from;
  const start = `${from} 00:00:00`;
  const end = `${to} 23:59:59`;

  const byDay = await query<{ day: string; total: unknown; count: number }>(
    `SELECT DATE(created_at) AS day, SUM(amount) AS total, COUNT(*) AS count
     FROM payments WHERE created_at BETWEEN ? AND ?
     GROUP BY DATE(created_at) ORDER BY day ASC`,
    [start, end],
  );
  const byMethod = await query<{ method: string; total: unknown; count: number }>(
    `SELECT method, SUM(amount) AS total, COUNT(*) AS count
     FROM payments WHERE created_at BETWEEN ? AND ?
     GROUP BY method ORDER BY total DESC`,
    [start, end],
  );
  const totalRow = await query<{ total: unknown; count: number }>(
    `SELECT SUM(amount) AS total, COUNT(*) AS count FROM payments WHERE created_at BETWEEN ? AND ?`,
    [start, end],
  );

  const rooms = await query<{ total: number; occupied: number }>(
    `SELECT COUNT(*) AS total, SUM(status = 'OCCUPIED') AS occupied FROM rooms`,
  );
  const staysInRange = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM stays WHERE checkin_at BETWEEN ? AND ? AND status != 'CANCELLED'`,
    [start, end],
  );

  const openFolios = await query<{
    folio_id: number; folio_number: string; stay_code: string; room_number: string;
    charges: unknown; discounts: unknown; payments: unknown;
  }>(
    `SELECT f.id AS folio_id, f.folio_number, s.stay_code, r.room_number,
            (SELECT COALESCE(SUM(amount),0) FROM charges c WHERE c.folio_id = f.id) AS charges,
            (SELECT COALESCE(SUM(amount),0) FROM applied_discounts d WHERE d.folio_id = f.id AND d.status = 'APPLIED') AS discounts,
            (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.folio_id = f.id) AS payments
     FROM folios f
     JOIN stays s ON s.id = f.stay_id
     JOIN rooms r ON r.id = s.room_id
     WHERE f.status = 'OPEN'
     ORDER BY f.id DESC`,
  );
  const outstanding = openFolios
    .map(f => ({
      folio_id: f.folio_id,
      folio_number: f.folio_number,
      stay_code: f.stay_code,
      room_number: f.room_number,
      balance: round2(toNum(f.charges) - toNum(f.discounts) - toNum(f.payments)),
    }))
    .filter(f => f.balance > 0.005);

  const totalRooms = Number(rooms[0]?.total ?? 0);
  const occupied = Number(rooms[0]?.occupied ?? 0);

  return Response.json({
    from,
    to,
    revenue: {
      total: round2(toNum(totalRow[0]?.total)),
      count: Number(totalRow[0]?.count ?? 0),
      byDay: byDay.map(r => ({ day: String(r.day).slice(0, 10), total: round2(toNum(r.total)), count: Number(r.count) })),
      byMethod: byMethod.map(r => ({ method: r.method, total: round2(toNum(r.total)), count: Number(r.count) })),
    },
    occupancy: {
      totalRooms,
      occupied,
      rate: totalRooms ? round2((occupied / totalRooms) * 100) : 0,
      staysInRange: Number(staysInRange[0]?.n ?? 0),
    },
    outstanding,
  });
}
