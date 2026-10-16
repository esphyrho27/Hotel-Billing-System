import { NextResponse } from 'next/server';

/**
 * GET /api/health — database connectivity probe.
 * ?deep=1 also runs the exact read queries the login flow uses
 * (login-attempt check + user lookup) to pinpoint failures.
 * Returns sanitized diagnostics only (no secrets, no hashes).
 */
export async function GET(req: Request) {
  const started = Date.now();
  const deep = new URL(req.url).searchParams.get('deep') === '1';
  try {
    const { query, queryOne } = await import('../../../lib/db');
    await query<{ ok: number }>('SELECT 1 AS ok');
    if (!deep) {
      return NextResponse.json({ ok: true, db: 'reachable', ms: Date.now() - started });
    }
    const steps: Record<string, unknown> = {};
    try {
      const r = await queryOne(
        `SELECT locked_until FROM auth_login_attempts
         WHERE attempt_key = ? AND locked_until IS NOT NULL AND locked_until > NOW()`,
        ['login:admin'],
      );
      steps.attemptsTable = { ok: true, locked: !!r?.locked_until };
    } catch (e) {
      steps.attemptsTable = { ok: false, error: errInfo(e) };
    }
    try {
      const u = await queryOne<{ id: number; username: string; role: string; active: number }>(
        `SELECT id, username, role, active FROM users WHERE username = ?`,
        ['admin'],
      );
      steps.adminUser = u
        ? { ok: true, id: u.id, username: u.username, role: u.role, active: Number(u.active) }
        : { ok: true, found: false };
    } catch (e) {
      steps.adminUser = { ok: false, error: errInfo(e) };
    }
    try {
      const t = await query<{ t: string }>(`SELECT COUNT(*) AS t FROM audit_logs`);
      steps.auditTable = { ok: true, rows: t[0]?.t };
    } catch (e) {
      steps.auditTable = { ok: false, error: errInfo(e) };
    }
    return NextResponse.json({ ok: true, db: 'reachable', ms: Date.now() - started, steps });
  } catch (err) {
    return NextResponse.json({ ok: false, ms: Date.now() - started, error: errInfo(err) }, { status: 500 });
  }
}

function errInfo(err: unknown) {
  const e = err as Error & { code?: string; errno?: number; sqlState?: string };
  return {
    code: e?.code,
    errno: e?.errno,
    sqlState: e?.sqlState,
    message: String(e?.message ?? e).slice(0, 200),
  };
}
