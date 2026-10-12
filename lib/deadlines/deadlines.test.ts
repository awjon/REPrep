// Table-driven tests for the deadline engine. Every expected date here was worked by hand
// against a calendar; when a rule changes, these are the cases to re-derive.

import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeDeadline,
  computeDealSchedule,
  isBusinessDay,
  pacificDateOf,
  pacificTimeToUtc,
  weekday,
} from './compute';
import { holidaysForYear, isHoliday } from './rules/holidays';
import { WA_DEFAULTS } from './rules/wa-defaults';
import { currentStage, dueReminders, type ReminderCandidate } from './reminders';

describe('Washington legal holidays (RCW 1.16.050 as encoded)', () => {
  it('lists the 2026 holidays with observed dates', () => {
    expect(holidaysForYear(2026).map((h) => `${h.date} ${h.name}`)).toEqual([
      '2026-01-01 New Year’s Day',
      '2026-01-19 Martin Luther King Jr. Day',
      '2026-02-16 Presidents’ Day',
      '2026-05-25 Memorial Day',
      '2026-06-19 Juneteenth',
      '2026-07-03 Independence Day (observed)',
      '2026-09-07 Labor Day',
      '2026-11-11 Veterans Day',
      '2026-11-26 Thanksgiving Day',
      '2026-11-27 Native American Heritage Day',
      '2026-12-25 Christmas Day',
    ]);
  });

  it.each([
    ['2027-06-18', 'Juneteenth on Saturday → Friday'],
    ['2027-12-24', 'Christmas on Saturday → Friday'],
    ['2027-12-31', 'New Year 2028 on Saturday → Friday of the prior year'],
    ['2029-11-12', 'Veterans Day on Sunday → Monday'],
    ['2028-07-04', 'Independence Day on a Tuesday stays put'],
  ])('%s is a holiday (%s)', (date) => {
    expect(isHoliday(date)).toBe(true);
  });

  it.each([
    ['2026-07-04', 'actual Saturday date is not itself the observed holiday'],
    ['2026-10-12', 'Columbus/Indigenous Peoples’ Day is not a WA legal holiday'],
    ['2026-12-24', 'Christmas Eve'],
    ['2028-01-01', 'Saturday New Year’s Day itself'],
  ])('%s is not a holiday (%s)', (date) => {
    expect(isHoliday(date)).toBe(false);
  });

  it('every year 2024–2040 has 11 holidays, all on weekdays', () => {
    for (let y = 2024; y <= 2040; y++) {
      const list = holidaysForYear(y);
      expect(list.length, String(y)).toBeGreaterThanOrEqual(10); // 10 when a New Year shifts into the prior year
      for (const h of list) {
        expect(h.date.startsWith(String(y))).toBe(true);
        expect([0, 6]).not.toContain(weekday(h.date));
      }
    }
  });
});

describe('calendar helpers', () => {
  it.each([
    ['2026-10-09', 1, '2026-10-10'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-03-01', -1, '2026-02-28'],
  ])('addDays(%s, %i) = %s', (d, n, out) => {
    expect(addDays(d, n)).toBe(out);
  });

  it.each([
    ['2026-10-09', true],
    ['2026-10-10', false],
    ['2026-10-11', false],
    ['2026-11-26', false],
  ])('isBusinessDay(%s) = %s', (d, out) => {
    expect(isBusinessDay(d)).toBe(out);
  });

  it.each([
    ['2026-10-10T06:30:00Z', '2026-10-09'], // 23:30 PDT
    ['2026-10-10T07:00:00Z', '2026-10-10'], // 00:00 PDT
    ['2026-12-01T07:59:00Z', '2026-11-30'], // 23:59 PST
    ['2026-12-01T08:00:00Z', '2026-12-01'],
  ])('pacificDateOf(%s) = %s', (iso, out) => {
    expect(pacificDateOf(new Date(iso))).toBe(out);
  });

  it.each([
    ['2026-10-14', '21:00', '2026-10-15T04:00:00.000Z'], // PDT, UTC-7
    ['2026-12-02', '21:00', '2026-12-03T05:00:00.000Z'], // PST, UTC-8
    ['2026-11-01', '21:00', '2026-11-02T05:00:00.000Z'], // DST ended at 02:00 that morning
    ['2026-03-08', '21:00', '2026-03-09T04:00:00.000Z'], // DST began at 02:00 that morning
    ['2026-03-08', '01:30', '2026-03-08T09:30:00.000Z'], // before the spring-forward gap
    ['2026-11-01', '09:00', '2026-11-01T17:00:00.000Z'], // after fall-back
  ])('pacificTimeToUtc(%s %s)', (d, t, out) => {
    expect(pacificTimeToUtc(d, t).toISOString()).toBe(out);
  });

  it('rejects malformed input', () => {
    expect(() => addDays('2026-13-01', 1)).toThrow(/invalid date/);
    expect(() => pacificTimeToUtc('2026-10-14', '25:00')).toThrow(/invalid time/);
    expect(() => pacificTimeToUtc('2026-10-14', '9pm')).toThrow(/invalid time/);
    expect(() => pacificTimeToUtc('2026-10-14', '21:60')).toThrow(/invalid time/);
    expect(() => pacificTimeToUtc('2026-03-08', '02:30')).toThrow(/nonexistent/);
    expect(() => addDays('not-a-date', 1)).toThrow(/invalid date/);
    expect(() => addDays('2026-02-30', 1)).toThrow(/invalid date/);
  });
});

describe('computeDeadline', () => {
  it.each([
    // [label, start (event date), days, expected due date]
    ['3 business days from a Friday skip the weekend', '2026-10-09', 3, '2026-10-14'],
    ['3 business days across Thanksgiving + Heritage Day', '2026-11-25', 3, '2026-12-02'],
    ['5 days is still a business-day period', '2026-10-09', 5, '2026-10-16'],
    ['6 days counts calendar days', '2026-10-09', 6, '2026-10-15'],
    ['10 days ending on a weekday stays put', '2026-10-12', 10, '2026-10-22'],
    ['10 days ending on Saturday rolls to Monday', '2026-10-14', 10, '2026-10-26'],
    ['21 days ending on Thanksgiving rolls past the 4-day weekend', '2026-11-05', 21, '2026-11-30'],
    ['1 business day from Friday before Labor Day', '2026-09-04', 1, '2026-09-08'],
    ['period starting on a weekend event date', '2026-10-10', 2, '2026-10-13'],
  ])('%s', (_label, start, days, due) => {
    const r = computeDeadline({ start, days });
    expect(r.dueDate).toBe(due);
    expect(r.dueAt).toEqual(pacificTimeToUtc(due, '21:00'));
    expect(r.rule).toBe(days <= 5 ? 'business_days' : 'calendar_days_rolled');
  });

  it('possession periods count calendar days and never roll', () => {
    const r = computeDeadline({ start: '2026-10-14', days: 3, noRoll: true });
    expect(r.dueDate).toBe('2026-10-17'); // Saturday, kept
    expect(r.rule).toBe('calendar_days');
  });

  it('a fixed closing date on a holiday rolls to the next business day', () => {
    const r = computeDeadline({ fixedDate: '2026-11-26' });
    expect(r.dueDate).toBe('2026-11-30');
    expect(r.rule).toBe('fixed_date_rolled');
  });

  it('a fixed date that is a business day is unchanged', () => {
    expect(computeDeadline({ fixedDate: '2026-11-24' }).dueDate).toBe('2026-11-24');
  });

  it('a fixed date with noRoll is kept even on a weekend', () => {
    const r = computeDeadline({ fixedDate: '2026-10-17', noRoll: true });
    expect(r.dueDate).toBe('2026-10-17');
    expect(r.rule).toBe('fixed_date');
  });

  it('rejects nonsense', () => {
    expect(() => computeDeadline({ start: '2026-10-09', days: 0 })).toThrow(/days/);
    expect(() => computeDeadline({ start: '2026-10-09', days: 400 })).toThrow(/days/);
    expect(() => computeDeadline({})).toThrow(/start/);
    expect(() => computeDeadline({ start: '2026-10-09' })).toThrow(/days/);
    expect(() => computeDeadline({ start: '2026-10-09', days: 2.5 })).toThrow(/days/);
    expect(() => computeDeadline({ fixedDate: '2026-02-30' })).toThrow(/invalid date/);
  });
});

describe('computeDealSchedule', () => {
  const acceptedAt = new Date('2026-10-10T06:30:00Z'); // Fri Oct 9, 23:30 PDT

  it('builds the default schedule from mutual acceptance', () => {
    const s = computeDealSchedule({ mutualAcceptanceAt: acceptedAt });
    const byKind = Object.fromEntries(s.map((d) => [d.kind, d.dueDate]));
    expect(byKind.earnest_money).toBe('2026-10-13'); // 2 business days: Mon 12, Tue 13
    expect(byKind.form17_review).toBe('2026-10-14'); // 3 business days
    expect(byKind.inspection).toBe('2026-10-19'); // 10 days → Mon Oct 19
    expect(byKind.closing).toBeUndefined(); // needs a closing date
    for (const d of s) expect(d.label).toBeTruthy();
  });

  it('possession can be set N days after closing and is not rolled', () => {
    const s = computeDealSchedule({ mutualAcceptanceAt: acceptedAt, closingDate: '2026-11-24', possessionDaysAfterClosing: 4 });
    expect(s.find((d) => d.kind === 'possession')!.dueDate).toBe('2026-11-28'); // Saturday, kept
  });

  it('honours per-deal overrides, a separate Form 17 receipt date, and closing/possession', () => {
    const s = computeDealSchedule({
      mutualAcceptanceAt: acceptedAt,
      form17ReceivedOn: '2026-10-12',
      closingDate: '2026-11-26',
      overrides: { inspection: 5, financing: 30 },
    });
    const byKind = Object.fromEntries(s.map((d) => [d.kind, d]));
    expect(byKind.form17_review!.dueDate).toBe('2026-10-15');
    expect(byKind.inspection!.dueDate).toBe('2026-10-16'); // 5 → business days
    expect(byKind.financing!.dueDate).toBe('2026-11-09'); // Sun Nov 8 → Mon
    expect(byKind.closing!.dueDate).toBe('2026-11-30');
    expect(byKind.possession!.dueDate).toBe('2026-11-30'); // default: on the (rolled) closing date, never rolled itself
  });

  it('can omit a default contingency by overriding it with null', () => {
    const s = computeDealSchedule({ mutualAcceptanceAt: acceptedAt, overrides: { inspection: null } });
    expect(s.find((d) => d.kind === 'inspection')).toBeUndefined();
  });

  it('every default is labelled as a default to confirm against the contract', () => {
    for (const d of WA_DEFAULTS) {
      expect(d.note).toMatch(/confirm/i);
    }
  });
});

describe('reminders', () => {
  const dueAt = pacificTimeToUtc('2026-10-14', '21:00'); // 2026-10-15T04:00Z
  const base: ReminderCandidate = {
    dealDateId: 'd1',
    dueAt,
    completedAt: null,
    dealStatus: 'under_contract',
    sentOffsets: [],
  };
  const at = (iso: string) => new Date(iso);

  it.each([
    ['2026-10-12T03:59:00Z', null], // just over 48h out
    ['2026-10-13T04:00:00Z', '48h'],
    ['2026-10-14T04:00:00Z', '24h'],
    ['2026-10-14T15:59:00Z', '24h'], // 08:59 PDT on the day
    ['2026-10-14T16:00:00Z', 'day_of'], // 09:00 PDT on the day
    ['2026-10-15T03:59:00Z', 'day_of'],
    ['2026-10-15T04:00:00Z', null], // deadline passed
  ])('stage at %s is %s', (now, stage) => {
    expect(currentStage(dueAt, at(now))).toBe(stage);
  });

  it('day_of fires at 09:00 even when the deadline is less than 12h away at entry', () => {
    expect(currentStage(dueAt, at('2026-10-14T20:00:00Z'))).toBe('day_of');
  });

  it('sends only the current stage, once', () => {
    const now = at('2026-10-14T05:00:00Z');
    expect(dueReminders([base], now)).toEqual([{ dealDateId: 'd1', offsetKey: '24h' }]);
    expect(dueReminders([{ ...base, sentOffsets: ['24h'] }], now)).toEqual([]);
  });

  it('skips stages already passed instead of sending a burst', () => {
    // Entered 30 minutes before the day_of stage: only day_of goes out, never 48h/24h retroactively.
    const now = at('2026-10-14T16:30:00Z');
    expect(dueReminders([base], now)).toEqual([{ dealDateId: 'd1', offsetKey: 'day_of' }]);
  });

  it('never reminds completed items or closed/terminated deals', () => {
    const now = at('2026-10-14T05:00:00Z');
    expect(dueReminders([{ ...base, completedAt: now }], now)).toEqual([]);
    expect(dueReminders([{ ...base, dealStatus: 'closed' }], now)).toEqual([]);
    expect(dueReminders([{ ...base, dealStatus: 'terminated' }], now)).toEqual([]);
  });
});
