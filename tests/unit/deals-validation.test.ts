import { describe, expect, it } from 'vitest';
import {
  customDeadlineSchema,
  dealFieldsSchema,
  dealUpdateSchema,
  exactDateSchema,
  scheduleInputsSchema,
} from '@/lib/deals/mutations';

const ok = <T>(r: { success: boolean; data?: T; error?: unknown }): T => {
  expect(r.success).toBe(true);
  return r.data as T;
};
const fieldsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.success ? [] : r.error!.issues.map((i) => String(i.path[0]));

describe('dealFieldsSchema', () => {
  it('requires an address and trims it', () => {
    expect(fieldsOf(dealFieldsSchema.safeParse({ address: '   ' }))).toEqual(['address']);
    expect(ok(dealFieldsSchema.safeParse({ address: '  12 Alki Ave SW ' })).address).toBe('12 Alki Ave SW');
  });
  it('turns blank optional fields (and null from FormData) into null', () => {
    const v = ok(dealFieldsSchema.safeParse({ address: 'x st', parcelPin: '', listPrice: '  ', notes: null }));
    expect(v).toEqual({ address: 'x st', parcelPin: null, listPrice: null, notes: null });
  });
  it('accepts a 10-digit PIN only', () => {
    expect(ok(dealFieldsSchema.safeParse({ address: 'a', parcelPin: '1234567890' })).parcelPin).toBe('1234567890');
    for (const bad of ['123456789', '12345678901', '12345-6789', 'abcdefghij']) {
      expect(fieldsOf(dealFieldsSchema.safeParse({ address: 'a', parcelPin: bad }))).toEqual(['parcelPin']);
    }
  });
  it('accepts a non-negative whole-dollar price, tolerating $ and commas', () => {
    expect(ok(dealFieldsSchema.safeParse({ address: 'a', listPrice: '850000' })).listPrice).toBe(850000);
    expect(ok(dealFieldsSchema.safeParse({ address: 'a', listPrice: '$1,250,000' })).listPrice).toBe(1250000);
    expect(ok(dealFieldsSchema.safeParse({ address: 'a', listPrice: '0' })).listPrice).toBe(0);
    for (const bad of ['-5', '850000.50', 'abc', '3000000000']) {
      expect(fieldsOf(dealFieldsSchema.safeParse({ address: 'a', listPrice: bad }))).toEqual(['listPrice']);
    }
  });
});

describe('dealUpdateSchema', () => {
  it('adds a status limited to the known values', () => {
    expect(ok(dealUpdateSchema.safeParse({ address: 'a', status: 'offer_prep' })).status).toBe('offer_prep');
    expect(fieldsOf(dealUpdateSchema.safeParse({ address: 'a', status: 'nope' }))).toEqual(['status']);
  });
});

describe('scheduleInputsSchema', () => {
  it('converts datetime-local as Pacific time (PDT and PST)', () => {
    const a = ok(scheduleInputsSchema.safeParse({ acceptanceAt: '2026-10-09T23:30' }));
    expect(a.mutualAcceptanceAt?.toISOString()).toBe('2026-10-10T06:30:00.000Z');
    const b = ok(scheduleInputsSchema.safeParse({ acceptanceAt: '2026-12-01T09:00' }));
    expect(b.mutualAcceptanceAt?.toISOString()).toBe('2026-12-01T17:00:00.000Z');
  });
  it('rejects malformed or nonexistent times', () => {
    expect(fieldsOf(scheduleInputsSchema.safeParse({ acceptanceAt: 'tomorrow' }))).toEqual(['acceptanceAt']);
    expect(fieldsOf(scheduleInputsSchema.safeParse({ acceptanceAt: '2026-02-31T10:00' }))).toEqual(['acceptanceAt']);
    expect(fieldsOf(scheduleInputsSchema.safeParse({ acceptanceAt: '2026-03-08T02:30' }))).toEqual(['acceptanceAt']);
  });
  it('defaults everything when the form is blank', () => {
    const v = ok(scheduleInputsSchema.safeParse({ acceptanceAt: '', form17ReceivedOn: '', closingDate: '', possessionDays: '' }));
    expect(v).toEqual({
      mutualAcceptanceAt: null,
      form17ReceivedOn: null,
      closingDate: null,
      possessionDaysAfterClosing: 0,
      periodOverrides: {},
    });
  });
  it('validates date-only fields', () => {
    const v = ok(scheduleInputsSchema.safeParse({ form17ReceivedOn: '2026-10-11', closingDate: '2026-11-26' }));
    expect(v.form17ReceivedOn).toBe('2026-10-11');
    expect(v.closingDate).toBe('2026-11-26');
    expect(fieldsOf(scheduleInputsSchema.safeParse({ closingDate: '2026-13-01' }))).toEqual(['closingDate']);
  });
  it('validates possession days as a whole number from 0 to 365', () => {
    expect(ok(scheduleInputsSchema.safeParse({ possessionDays: '3' })).possessionDaysAfterClosing).toBe(3);
    for (const bad of ['-1', '1.5', '366', 'x']) {
      expect(fieldsOf(scheduleInputsSchema.safeParse({ possessionDays: bad }))).toEqual(['possessionDays']);
    }
  });
  it('maps period overrides: number, "not in my contract" -> null, blank -> default', () => {
    const v = ok(
      scheduleInputsSchema.safeParse({
        period_earnest_money: '',
        period_inspection: '14',
        none_financing: 'on',
        period_financing: '30', // ignored when the box is checked
      }),
    );
    expect(v.periodOverrides).toEqual({ inspection: 14, financing: null });
  });
  it('rejects bad period lengths', () => {
    for (const bad of ['0', '-2', '2.5', '400', 'abc']) {
      expect(fieldsOf(scheduleInputsSchema.safeParse({ period_inspection: bad }))).toEqual(['period_inspection']);
    }
  });
});

describe('customDeadlineSchema and exactDateSchema', () => {
  it('needs a label and a real date', () => {
    expect(ok(customDeadlineSchema.safeParse({ label: ' Walkthrough ', date: '2026-11-20' }))).toEqual({
      label: 'Walkthrough',
      date: '2026-11-20',
    });
    expect(fieldsOf(customDeadlineSchema.safeParse({ label: '', date: '2026-11-20' }))).toEqual(['label']);
    expect(fieldsOf(customDeadlineSchema.safeParse({ label: 'x', date: '2026-02-30' }))).toEqual(['date']);
  });
  it('validates an exact date', () => {
    expect(ok(exactDateSchema.safeParse({ date: '2026-11-20' })).date).toBe('2026-11-20');
    expect(exactDateSchema.safeParse({ date: '' }).success).toBe(false);
  });
});
