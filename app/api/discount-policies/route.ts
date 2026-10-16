import { guard } from '../../../lib/auth';
import { query } from '../../../lib/db';

/** Active discount policies for the folio discount dropdown. */
export async function GET() {
  const g = await guard(['admin', 'manager', 'frontdesk', 'cashier']);
  if (!g.ok) return g.response;
  const policies = await query(
    `SELECT id, name, category, discount_type, discount_value, applies_to, requires_manager
     FROM discount_policies WHERE active = 1 ORDER BY name ASC`,
  );
  return Response.json({ policies });
}
