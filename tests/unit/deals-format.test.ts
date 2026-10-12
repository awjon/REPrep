import { describe, expect, it } from 'vitest';
import {
  DEAL_STATUSES,
  formatPacific,
  formatPacificDate,
  formatPrice,
  pacificDateInputValue,
  pacificInputValue,
  relativeDue,
  statusLabel,
} from '@/lib/deals/format';

describe('formatPacific', () => {
  it('formats in Pacific daylight time', () => {
    expect(formatPacific(new Date('2026-10-20T04:00:00Z'))).toBe('Mon, Oct 19 · 9:00 pm');
  });
  it('formats in Pacific standard time', () => {
    expect(formatPacific(new Date('2026-12-01T05:00:00Z'))).toBe('Mon, Nov 30 · 9:00 pm');
  });
  it('follows the fall-back change (Nov 1, 2026)', () => {
    expect(formatPacific(new Date('2026-10-31T19:00:00Z'))).toBe('Sat, Oct 31 · 12:00 pm');
    expect(formatPacific(new Date('2026-11-01T20:00:00Z'))).toBe('Sun, Nov 1 · 12:00 pm');
  });
  it('shows midnight and morning hours', () => {
    expect(formatPacific(new Date('2026-07-04T07:00:00Z'))).toBe('Sat, Jul 4 · 12:00 am');
    expect(formatPacific(new Date('2026-07-04T16:05:00Z'))).toBe('Sat, Jul 4 · 9:05 am');
  });
  it('formats a date alone', () => {
    expect(formatPacificDate(new Date('2026-10-20T04:00:00Z'))).toBe('Mon, Oct 19');
  });
});

describe('pacificInputValue', () => {
  it('gives a datetime-local value in Pacific time', () => {
    expect(pacificInputValue(new Date('2026-10-20T04:00:00Z'))).toBe('2026-10-19T21:00');
    expect(pacificInputValue(new Date('2026-12-01T05:00:00Z'))).toBe('2026-11-30T21:00');
  });
  it('uses 00 for midnight, never 24', () => {
    expect(pacificInputValue(new Date('2026-07-04T07:00:00Z'))).toBe('2026-07-04T00:00');
  });
  it('gives a date value', () => {
    expect(pacificDateInputValue(new Date('2026-10-20T04:00:00Z'))).toBe('2026-10-19');
  });
});

describe('relativeDue', () => {
  const now = new Date('2026-10-12T19:00:00Z'); // Mon Oct 12, 12:00 pm PDT
  it('says passed once the instant is behind us', () => {
    expect(relativeDue(new Date('2026-10-12T18:00:00Z'), now)).toBe('passed');
  });
  it('says today for later the same Pacific day', () => {
    expect(relativeDue(new Date('2026-10-13T04:00:00Z'), now)).toBe('today'); // Oct 12, 9 pm
  });
  it('says tomorrow and counts days by Pacific calendar date', () => {
    expect(relativeDue(new Date('2026-10-14T04:00:00Z'), now)).toBe('tomorrow');
    expect(relativeDue(new Date('2026-10-15T04:00:00Z'), now)).toBe('in 2 days');
    expect(relativeDue(new Date('2026-10-20T04:00:00Z'), now)).toBe('in 7 days');
  });
  it('counts across a daylight-saving change', () => {
    const before = new Date('2026-10-31T19:00:00Z');
    expect(relativeDue(new Date('2026-11-03T05:00:00Z'), before)).toBe('in 2 days'); // Nov 2, 9 pm PST
  });
});

describe('labels and prices', () => {
  it('has a human label for every status', () => {
    expect(DEAL_STATUSES).toEqual(['watching', 'offer_prep', 'under_contract', 'closed', 'terminated']);
    expect(DEAL_STATUSES.map(statusLabel)).toEqual([
      'Watching',
      'Preparing an offer',
      'Under contract',
      'Closed',
      'Terminated',
    ]);
  });
  it('formats whole-dollar prices', () => {
    expect(formatPrice(850000)).toBe('$850,000');
    expect(formatPrice(null)).toBe('');
  });
});
