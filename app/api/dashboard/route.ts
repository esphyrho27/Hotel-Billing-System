import { guard } from '../../../lib/auth';
import { query, toNum, round2 } from '../../../lib/db';

/** Dashboard stats: occupancy, today's revenue, open folios, recent audit activity. */
export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;

  const rooms = await query<{ total: number; occupied: number; cleaning: number; maintenance: number }>(
    `SELECT COUNT(*) AS total,
            SUM(status = 'OCCUPIED') AS occupied,
            SUM(status = 'CLEANING') AS cleaning,
            SUM(status = 'MAINTENANCE') AS maintenance
     FROM rooms`,
  );
  const revenue = await query<{ total: unknown }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE DATE(created_at) = CURDATE()`,
  );
  const openFolios = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM folios WHERE status = 'OPEN'`);
  const activeStays = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM stays WHERE status = 'ACTIVE'`);

  // Total outstanding balance across all open folios.
  const openBal = await query<{ bal: unknown }>(
    `SELECT COALESCE(SUM(c.amount), 0)
            - COALESCE((SELECT SUM(d.amount) FROM applied_discounts d JOIN folios f2 ON f2.id = d.folio_id WHERE f2.status = 'OPEN' AND d.status = 'APPLIED'), 0)
            - COALESCE((SELECT SUM(p.amount) FROM payments p JOIN folios f3 ON f3.id = p.folio_id WHERE f3.status = 'OPEN'), 0) AS bal
     FROM charges c JOIN folios f ON f.id = c.folio_id WHERE f.status = 'OPEN'`,
  );
  // Open guest service requests (not completed/cancelled/rejected).
  const reqCounts = await query<{ is_new: number; active: number }>(
    `SELECT SUM(status = 'NEW') AS is_new,
            SUM(status IN ('ACCEPTED', 'IN_PROGRESS')) AS active
     FROM service_requests
     WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'REJECTED')`,
  );
  const activity = await query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.username
     FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ORDER BY a.id DESC LIMIT 10`,
  );

  const totalRooms = Number(rooms[0]?.total ?? 0);
  const occupied = Number(rooms[0]?.occupied ?? 0);

  return Response.json({
    occupancy: {
      total: totalRooms,
      occupied,
      cleaning: Number(rooms[0]?.cleaning ?? 0),
      maintenance: Number(rooms[0]?.maintenance ?? 0),
      rate: totalRooms ? round2((occupied / totalRooms) * 100) : 0,
    },
    todayRevenue: round2(toNum(revenue[0]?.total)),
    openFolios: Number(openFolios[0]?.n ?? 0),
    activeStays: Number(activeStays[0]?.n ?? 0),
    available: totalRooms - occupied - Number(rooms[0]?.cleaning ?? 0) - Number(rooms[0]?.maintenance ?? 0),
    openBalance: round2(toNum(openBal[0]?.bal)),
    requestsNew: Number(reqCounts[0]?.is_new ?? 0),
    requestsActive: Number(reqCounts[0]?.active ?? 0),
    activity,
  });
}
