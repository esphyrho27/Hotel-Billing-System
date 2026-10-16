/**
 * Session cookie name — edge-safe module (no Node-only imports).
 * Imported by middleware.ts (Edge runtime) and lib/auth.ts.
 * Do NOT import lib/db or other Node-only modules here.
 */
export const COOKIE_NAME = 'hbs_session';
