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
    activity,
  });
}
