/**
 * MySQL connection pool (TiDB Cloud Serverless compatible).
 * Cached on globalThis so Next.js dev / serverless reuse doesn't leak pools.
 * DECIMAL columns come back as strings from mysql2 — cast with toNum() before math.
 */
import mysql from 'mysql2/promise';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return v;
}

declare global {
  // eslint-disable-next-line no-var
  var __hbs_pool: mysql.Pool | undefined;
}

function getPool(): mysql.Pool {
  if (!globalThis.__hbs_pool) {
    globalThis.__hbs_pool = mysql.createPool({
      host: process.env.DATABASE_HOST || 'localhost',
      port: Number(process.env.DATABASE_PORT || 4000),
      user: process.env.DATABASE_USER || 'root',
      password: process.env.DATABASE_PASSWORD || '',
      database: process.env.DATABASE_NAME || 'db_hotel_billing',
      ssl: { rejectUnauthorized: true },
      connectionLimit: 3,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      // Return DATE/DATETIME as strings to avoid TZ surprises; parse in app code.
      dateStrings: true,
    });
  }
  return globalThis.__hbs_pool;
}

/** Values accepted by mysql2 parameter binding. */
export type SqlParams = (string | number | boolean | null | Date)[];

/** Lazily validates env on first real use (keeps `next build` from crashing). */
export function pool(): mysql.Pool {
  required('DATABASE_HOST');
  required('DATABASE_USER');
  required('DATABASE_PASSWORD');
  return getPool();
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: SqlParams = [],
): Promise<T[]> {
  const [rows] = await pool().execute(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: SqlParams = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** For INSERT/UPDATE/DELETE — returns insertId / affectedRows. */
export async function exec(
  sql: string,
  params: SqlParams = [],
): Promise<{ insertId: number; affectedRows: number }> {
  const [res] = await pool().execute(sql, params);
  const r = res as unknown as { insertId?: number | string; affectedRows?: number | string };
  return { insertId: Number(r.insertId ?? 0), affectedRows: Number(r.affectedRows ?? 0) };
}

/** Run a callback inside a real MySQL transaction. Rolls back on throw. */
export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* ignore rollback errors */
    }
    throw err;
  } finally {
    conn.release();
  }
}

/** Cast a mysql DECIMAL (returned as string) to a JS number safely. */
export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round to 2dp for money math. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
