// Washington State legal holidays, encoded from RCW 1.16.050 as we read it.
// Observance: a holiday on Sunday moves to Monday; on Saturday, to the preceding Friday.
// These are DEFAULTS for computing contract deadlines — confirm with an attorney before Phase B
// (CLAUDE.md open question #3). Changes here need the guardrail review.

import { addDays, nthWeekdayOf, lastWeekdayOf, weekday, ymd } from '../calendar';

export type Holiday = { date: string; name: string };

type Rule = { name: string; on: (year: number) => string; shifts: boolean };

const fixed = (month: number, day: number) => (y: number) => ymd(y, month, day);

/** The holiday rules. Order is calendar order. */
export const WA_HOLIDAY_RULES: readonly Rule[] = [
  { name: 'New Year’s Day', on: fixed(1, 1), shifts: true },
  { name: 'Martin Luther King Jr. Day', on: (y) => nthWeekdayOf(y, 1, 1, 3), shifts: false },
  { name: 'Presidents’ Day', on: (y) => nthWeekdayOf(y, 2, 1, 3), shifts: false },
  { name: 'Memorial Day', on: (y) => lastWeekdayOf(y, 5, 1), shifts: false },
  { name: 'Juneteenth', on: fixed(6, 19), shifts: true },
  { name: 'Independence Day', on: fixed(7, 4), shifts: true },
  { name: 'Labor Day', on: (y) => nthWeekdayOf(y, 9, 1, 1), shifts: false },
  { name: 'Veterans Day', on: fixed(11, 11), shifts: true },
  { name: 'Thanksgiving Day', on: (y) => nthWeekdayOf(y, 11, 4, 4), shifts: false },
  { name: 'Native American Heritage Day', on: (y) => addDays(nthWeekdayOf(y, 11, 4, 4), 1), shifts: false },
  { name: 'Christmas Day', on: fixed(12, 25), shifts: true },
];

function observed(rule: Rule, year: number): Holiday {
  const actual = rule.on(year);
  if (!rule.shifts) return { date: actual, name: rule.name };
  const dow = weekday(actual);
  if (dow === 0) return { date: addDays(actual, 1), name: `${rule.name} (observed)` };
  if (dow === 6) return { date: addDays(actual, -1), name: `${rule.name} (observed)` };
  return { date: actual, name: rule.name };
}

const cache = new Map<number, Holiday[]>();

/** Observed holidays falling in `year` (a Saturday New Year's Day lands on Dec 31 of the prior year). */
export function holidaysForYear(year: number): Holiday[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const prefix = String(year);
  const list = [year, year + 1]
    .flatMap((y) => WA_HOLIDAY_RULES.map((r) => observed(r, y)))
    .filter((h) => h.date.startsWith(prefix))
    .sort((a, b) => a.date.localeCompare(b.date));
  cache.set(year, list);
  return list;
}

export function isHoliday(date: string): boolean {
  return holidaysForYear(Number(date.slice(0, 4))).some((h) => h.date === date);
}
