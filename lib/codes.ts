/** Readable unique code generators for stays, folios, receipts, requests, refunds. */
import crypto from 'crypto';

function rand(n: number): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, n).toUpperCase();
}

function ymd(d: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export const newStayCode = () => `ST-${ymd()}-${rand(6)}`;
export const newFolioNumber = () => `F-${ymd()}-${rand(6)}`;
export const newReceiptNumber = () => `R-${ymd()}-${rand(6)}`;
export const newRequestCode = () => `SR-${ymd()}-${rand(6)}`;
export const newRefundNumber = () => `RF-${ymd()}-${rand(6)}`;
export const newIdempotencyKey = () => crypto.randomUUID();
