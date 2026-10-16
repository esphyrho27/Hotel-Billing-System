/**
 * Auth: bcrypt passwords, login throttling (auth_login_attempts table),
 * jose JWT sessions in an httpOnly cookie, role guards for API routes.
 */
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { query, queryOne } from './db';
import { COOKIE_NAME } from './cookie';

export { COOKIE_NAME };
export const SESSION_HOURS = 8;

export type Role = 'admin' | 'manager' | 'frontdesk' | 'cashier' | 'service';
export const ROLES: Role[] = ['admin', 'manager', 'frontdesk', 'cashier', 'service'];

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

interface DbUser {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  active: number;
  session_version: number;
}

function jwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('Missing required env var JWT_SECRET (see .env.example)');
  return new TextEncoder().encode(s);
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/* ── Login throttling (uses auth_login_attempts; comparisons done in SQL) ── */
const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 10;
const LOCK_MINUTES = 15;

export async function isLocked(key: string): Promise<{ locked: boolean; retryAfterSec: number }> {
  const row = await queryOne<{ locked_until: string | null }>(
    `SELECT locked_until FROM auth_login_attempts
     WHERE attempt_key = ? AND locked_until IS NOT NULL AND locked_until > NOW()`,
    [key],
  );
  if (!row?.locked_until) return { locked: false, retryAfterSec: 0 };
  const s = await queryOne<{ sec: number }>(
    `SELECT TIMESTAMPDIFF(SECOND, NOW(), ?) AS sec`,
    [row.locked_until],
  );
  return { locked: true, retryAfterSec: Math.max(0, s?.sec ?? 0) };
}

export async function registerFailedLogin(key: string): Promise<void> {
  const row = await queryOne<{ attempts: number; window_started_at: string }>(
    `SELECT attempts, DATE_FORMAT(window_started_at, '%Y-%m-%d %H:%i:%s') AS window_started_at
     FROM auth_login_attempts WHERE attempt_key = ?`,
    [key],
  );
  const cutoff = await queryOne<{ cutoff: string }>(
    `SELECT DATE_FORMAT(NOW() - INTERVAL ${WINDOW_MINUTES} MINUTE, '%Y-%m-%d %H:%i:%s') AS cutoff`,
  );
  const expired = !row || (cutoff?.cutoff ?? '') > row.window_started_at;
  if (expired) {
    await query(
      `INSERT INTO auth_login_attempts (attempt_key, attempts, window_started_at, locked_until)
       VALUES (?, 1, NOW(), NULL)
       ON DUPLICATE KEY UPDATE attempts = 1, window_started_at = NOW(), locked_until = NULL`,
      [key],
    );
  } else {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await query(
        `UPDATE auth_login_attempts SET attempts = ?, locked_until = NOW() + INTERVAL ${LOCK_MINUTES} MINUTE WHERE attempt_key = ?`,
        [attempts, key],
      );
    } else {
      await query(`UPDATE auth_login_attempts SET attempts = ? WHERE attempt_key = ?`, [attempts, key]);
    }
  }
}

export async function clearLoginAttempts(key: string): Promise<void> {
  await query(`DELETE FROM auth_login_attempts WHERE attempt_key = ?`, [key]);
}

export function loginAttemptKey(username: string): string {
  return `login:${username.trim().toLowerCase()}`.slice(0, 64);
}

/* ── Sessions ── */
export async function createSession(user: SessionUser & { session_version: number }): Promise<void> {
  const token = await new SignJWT({
    sub: String(user.id),
    username: user.username,
    role: user.role,
    sv: user.session_version,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(jwtSecret());
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    const id = Number(payload.sub);
    if (!Number.isFinite(id)) return null;
    const u = await queryOne<DbUser>(
      `SELECT id, username, password_hash, role, active, session_version FROM users WHERE id = ?`,
      [id],
    );
    if (!u || !u.active) return null;
    // Session version mismatch → password was reset; force re-login.
    if (payload.sv !== undefined && Number(payload.sv) !== Number(u.session_version)) return null;
    return { id: u.id, username: u.username, role: u.role };
  } catch {
    return null;
  }
}

export async function findUserByUsername(username: string): Promise<DbUser | null> {
  return queryOne<DbUser>(
    `SELECT id, username, password_hash, role, active, session_version FROM users WHERE username = ?`,
    [username.trim()],
  );
}

/* ── Route guards ── */
export function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized — please log in.' }, { status: 401 });
}

export function forbidden(): Response {
  return Response.json({ error: 'Forbidden — your role cannot perform this action.' }, { status: 403 });
}

export type GuardResult = { ok: true; user: SessionUser } | { ok: false; response: Response };

/** Require a logged-in user whose role is in `roles` (empty = any authenticated user). */
export async function guard(roles: Role[] = []): Promise<GuardResult> {
  const user = await getSession();
  if (!user) return { ok: false, response: unauthorized() };
  if (roles.length > 0 && !roles.includes(user.role)) return { ok: false, response: forbidden() };
  return { ok: true, user };
}

/** Role matrix for the UI. */
export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  frontdesk: 'Front Desk',
  cashier: 'Cashier',
  service: 'Service Staff',
};
