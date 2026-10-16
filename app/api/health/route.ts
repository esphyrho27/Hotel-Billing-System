import { NextResponse } from 'next/server';

/**
 * GET /api/health — database connectivity probe.
 * Returns sanitized diagnostics only (no secrets, no connection strings).
 */
export async function GET() {
  const started = Date.now();
  try {
    const { query } = await import('../../../lib/db');
    const rows = await query<{ ok: number }>('SELECT 1 AS ok');
    return NextResponse.json({ ok: true, db: 'reachable', ms: Date.now() - started, rows });
  } catch (err) {
    const e = err as Error & { code?: string; errno?: number; sqlState?: string };
    return NextResponse.json(
      {
        ok: false,
        ms: Date.now() - started,
        code: e?.code,
        errno: e?.errno,
        sqlState: e?.sqlState,
        message: String(e?.message ?? e).slice(0, 200),
        envPresent: {
          host: !!process.env.DATABASE_HOST,
          port: !!process.env.DATABASE_PORT,
          user: !!process.env.DATABASE_USER,
          password: !!process.env.DATABASE_PASSWORD,
          database: !!process.env.DATABASE_NAME,
        },
        hostSuffix: (process.env.DATABASE_HOST ?? '').slice(-30),
      },
      { status: 500 },
    );
  }
}
