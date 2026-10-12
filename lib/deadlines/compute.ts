// Deadline engine — pure functions, no I/O. See tests for the hand-worked cases.

import { addDays, parseYmd, weekday } from './calendar';
import { isHoliday } from './rules/holidays';
import {
  BUSINESS_DAY_THRESHOLD,
  CLOSING_NOTE,
  DEADLINE_HOUR,
  POSSESSION_NOTE,
  WA_DEFAULTS,
  type DefaultKind,
} from './rules/wa-defaults';

export { addDays, weekday };

const TZ = 'America/Los_Angeles';

export function isBusinessDay(date: string): boolean {
  const dow = weekday(date);
  return dow !== 0 && dow !== 6 && !isHoliday(date);
}

function nextBusinessDayOnOrAfter(date: string): string {
  let d = date;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

const pacificParts = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function partsOf(instant: Date): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of pacificParts.formatToParts(instant)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Calendar date in Pacific time for an instant. */
export function pacificDateOf(instant: Date): string {
  const p = partsOf(instant);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** The UTC instant of a Pacific wall-clock time on a date (handles PST/PDT). */
export function pacificTimeToUtc(date: string, time: string): Date {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`invalid time: ${time}`);
  const wallAsUtc = parseYmd(date).getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000;
  // Pacific is UTC-7 or UTC-8. Try both; keep the one that reads back as the requested wall time.
  for (const offsetHours of [7, 8]) {
    const candidate = new Date(wallAsUtc + offsetHours * 3_600_000);
    const p = partsOf(candidate);
    if (p.hour === Number(m[1]) && p.minute === Number(m[2]) && pacificDateOf(candidate) === date) return candidate;
  }
  // 02:00–02:59 on the spring-forward day does not exist in Pacific time.
  throw new Error(`nonexistent Pacific time: ${date} ${time}`);
}

export type DeadlineInput = {
  /** Event date (Pacific). The period starts the following day. */
  start?: string;
  days?: number;
  /** A specific date agreed in the contract (e.g. closing). */
  fixedDate?: string;
  /** Count calendar days and never roll off weekends/holidays (possession). */
  noRoll?: boolean;
};

export type DeadlineRule = 'business_days' | 'calendar_days_rolled' | 'calendar_days' | 'fixed_date_rolled' | 'fixed_date';

export type ComputedDeadline = { dueDate: string; dueAt: Date; rule: DeadlineRule };

function at9pm(dueDate: string, rule: DeadlineRule): ComputedDeadline {
  return { dueDate, dueAt: pacificTimeToUtc(dueDate, DEADLINE_HOUR), rule };
}

export function computeDeadline(input: DeadlineInput): ComputedDeadline {
  if (input.fixedDate) {
    parseYmd(input.fixedDate);
    if (input.noRoll) return at9pm(input.fixedDate, 'fixed_date');
    const rolled = nextBusinessDayOnOrAfter(input.fixedDate);
    return at9pm(rolled, rolled === input.fixedDate ? 'fixed_date' : 'fixed_date_rolled');
  }
  if (!input.start) throw new Error('computeDeadline: start or fixedDate is required');
  const days = input.days ?? 0;
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error(`computeDeadline: invalid days ${days}`);

  if (input.noRoll) return at9pm(addDays(input.start, days), 'calendar_days');

  if (days <= BUSINESS_DAY_THRESHOLD) {
    let d = input.start;
    for (let counted = 0; counted < days; ) {
      d = addDays(d, 1);
      if (isBusinessDay(d)) counted++;
    }
    return at9pm(d, 'business_days');
  }
  return at9pm(nextBusinessDayOnOrAfter(addDays(input.start, days)), 'calendar_days_rolled');
}

// ---------- whole-deal schedule ----------

export type ScheduleKind = DefaultKind | 'closing' | 'possession';

export type ScheduledDeadline = ComputedDeadline & {
  kind: ScheduleKind;
  label: string;
  periodDays: number | null;
  note: string;
};

export type ScheduleInput = {
  mutualAcceptanceAt: Date;
  /** Date the buyer received the seller disclosure; defaults to the acceptance date. */
  form17ReceivedOn?: string;
  closingDate?: string;
  possessionDaysAfterClosing?: number;
  /** Per-kind period in days; null removes that contingency. */
  overrides?: Partial<Record<DefaultKind, number | null>>;
};

export function computeDealSchedule(input: ScheduleInput): ScheduledDeadline[] {
  const acceptedOn = pacificDateOf(input.mutualAcceptanceAt);
  const out: ScheduledDeadline[] = [];

  for (const def of WA_DEFAULTS) {
    const override = input.overrides?.[def.kind];
    if (override === null) continue;
    const days = override ?? def.days;
    const start = def.from === 'form17_receipt' ? (input.form17ReceivedOn ?? acceptedOn) : acceptedOn;
    out.push({ ...computeDeadline({ start, days }), kind: def.kind, label: def.label, periodDays: days, note: def.note });
  }

  if (input.closingDate) {
    const closing = computeDeadline({ fixedDate: input.closingDate });
    out.push({ ...closing, kind: 'closing', label: 'Closing', periodDays: null, note: CLOSING_NOTE });
    const after = input.possessionDaysAfterClosing ?? 0;
    const possession =
      after === 0
        ? computeDeadline({ fixedDate: closing.dueDate, noRoll: true })
        : computeDeadline({ start: closing.dueDate, days: after, noRoll: true });
    out.push({ ...possession, kind: 'possession', label: 'Possession', periodDays: after || null, note: POSSESSION_NOTE });
  }

  return out.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
