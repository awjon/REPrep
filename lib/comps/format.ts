// Display helpers. Pure.

export const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const int = (n: number) => Math.round(n).toLocaleString('en-US');

/** Full + 3/4 + 1/2 baths as a decimal, e.g. 2.75. */
export function bathsValue(full: number | null, threeQtr: number | null, half: number | null): number | null {
  if (full === null && threeQtr === null && half === null) return null;
  return (full ?? 0) + 0.75 * (threeQtr ?? 0) + 0.5 * (half ?? 0);
}

export const bathsLabel = (b: number | null) => (b === null ? '—' : String(Number(b.toFixed(2))));

export function formatDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** YYYY-MM-DD for `asOf` minus whole calendar months (day clamped to month end). */
export function monthsAgo(asOf: string, months: number): string {
  const [y, m, d] = asOf.split('-').map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d!, lastDay));
  return target.toISOString().slice(0, 10);
}
