import { guard } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET() {
  const g = await guard();
  if (!g.ok) return g.response;
  const items = await query(
    `SELECT * FROM service_catalog WHERE active = 1 ORDER BY category ASC, name ASC`,
  );
  return Response.json({ items });
}
