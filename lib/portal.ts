/**
 * Guest portal tokens.
 *
 * Guests open /portal/<token> without logging in. Only the SHA-256 hash of
 * the token is stored (portal_tokens.token_hash); the raw token is shown to
 * staff once at creation/regeneration time and must be shared with the guest.
 *
 * Node-only module (uses crypto + mysql2 via lib/db) — import from API
 * routes only, never from middleware (Edge runtime).
 */
import crypto from 'node:crypto';
import { exec, query, queryOne } from './db';

export interface PortalTokenInfo {
  stay_id: number;
  expires_at: string;
}

/** 256-bit URL-safe token. */
export function newPortalToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashPortalToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Expiry: planned checkout date + 3 days, end of day (DATETIME string). */
export function portalExpiry(plannedCheckout: string): string {
  const d = new Date(`${plannedCheckout}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setDate(fallback.getDate() + 14);
    return toDbDatetime(fallback);
  }
  d.setDate(d.getDate() + 3);
  d.setHours(23, 59, 59, 0);
  return toDbDatetime(d);
}

function toDbDatetime(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Create a fresh portal token for a stay, revoking any previous active ones.
 * Returns the RAW token (show it to staff once — it cannot be recovered later).
 */
export async function createPortalToken(stayId: number, expiresAt: string): Promise<string> {
  const token = newPortalToken();
  await exec(`UPDATE portal_tokens SET revoked_at = NOW() WHERE stay_id = ? AND revoked_at IS NULL`, [stayId]);
  await exec(`INSERT INTO portal_tokens (stay_id, token_hash, expires_at) VALUES (?, ?, ?)`, [
    stayId,
    hashPortalToken(token),
    expiresAt,
  ]);
  return token;
}

/** Validate a raw token. Returns the stay id, or null when unknown/expired/revoked. */
export async function resolvePortalToken(token: string): Promise<PortalTokenInfo | null> {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 128) return null;
  const row = await queryOne<{ stay_id: number; expires_at: string }>(
    `SELECT stay_id, expires_at FROM portal_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [hashPortalToken(token)],
  );
  if (!row) return null;
  return { stay_id: Number(row.stay_id), expires_at: String(row.expires_at) };
}

/** Whether the stay currently has a usable (non-expired, non-revoked) portal link. */
export async function getActivePortalLink(stayId: number): Promise<{ expires_at: string } | null> {
  const row = await queryOne<{ expires_at: string }>(
    `SELECT expires_at FROM portal_tokens
     WHERE stay_id = ? AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [stayId],
  );
  return row ? { expires_at: String(row.expires_at) } : null;
}

/** Recent service requests for a stay (guest-visible subset). */
export async function getStayRequests(stayId: number) {
  return query(
    `SELECT id, request_code, service_type, description, status, price, created_at
     FROM service_requests WHERE stay_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`,
    [stayId],
  );
}
