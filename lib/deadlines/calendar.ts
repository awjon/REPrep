// Date-only arithmetic on 'YYYY-MM-DD' strings, done in UTC so it never depends on the host timezone.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseYmd(date: string): Date {
  const m = DATE_RE.exec(date);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!d || d.toISOString().slice(0, 10) !== date) throw new Error(`invalid date: ${date}`);
  return d;
}

export function ymd(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = parseYmd(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: string): number {
  return parseYmd(date).getUTCDay();
}

/** The nth (1-based) given weekday of a month, e.g. 3rd Monday of January. */
export function nthWeekdayOf(year: number, month: number, dow: number, n: number): string {
  const first = ymd(year, month, 1);
  const offset = (dow - weekday(first) + 7) % 7;
  return addDays(first, offset + (n - 1) * 7);
}

/** The last given weekday of a month, e.g. last Monday of May. */
export function lastWeekdayOf(year: number, month: number, dow: number): string {
  const last = addDays(ymd(year, month + 1, 1), -1);
  const back = (weekday(last) - dow + 7) % 7;
  return addDays(last, -back);
}
