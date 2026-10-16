/** Philippine peso formatting. */
export function peso(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return '₱' + v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
