/** Audit logging helper — writes to audit_logs. Fire-and-forget safe. */
import { query } from './db';

export async function audit(
  userId: number | null,
  action: string,
  entityType: string,
  entityId: number | null,
  details?: Record<string, unknown>,
  ip?: string | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        ip ?? null,
      ],
    );
  } catch {
    /* audit must never break the main flow */
  }
}

export function clientIp(req: Request): string | null {
  const h = (n: string) => req.headers.get(n);
  const fwd = h('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim().slice(0, 45);
  return h('x-real-ip')?.slice(0, 45) ?? null;
}
