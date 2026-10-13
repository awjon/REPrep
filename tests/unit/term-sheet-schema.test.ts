import { describe, expect, it } from 'vitest';
import { findBanned } from '@/lib/legal/banned-phrases';
import { termSheetDefaults } from '@/lib/term-sheet/defaults';
import { dataToForm, parseTermSheetForm, termSheetDataSchema } from '@/lib/term-sheet/schema';

const deal = {
  address: '1 Alki Ave SW',
  parcelPin: '9800000001',
  closingDate: '2026-12-15',
  possessionDaysAfterClosing: 0,
  periodOverrides: {} as Record<string, number | null>,
};
const form = (over: Record<string, string> = {}) => ({
  ...dataToForm(termSheetDefaults(deal)),
  price: '850000',
  ...over,
});
const errs = (over: Record<string, string>) => {
  const r = parseTermSheetForm(form(over));
  if (r.ok) throw new Error('expected errors');
  return r.errors;
};

describe('termSheetDefaults', () => {
  it('prefills address, PIN, closing date and common contingency days but never the price', () => {
    const d = termSheetDefaults({ ...deal, periodOverrides: { inspection: 7 } });
    expect(d.property).toEqual({ address: '1 Alki Ave SW', pin: '9800000001' });
    expect(d.price).toBeNull();
    expect(d.closingDate).toBe('2026-12-15');
    expect(d.contingencies.inspection).toEqual({ included: true, days: 7 });
    expect(d.contingencies.financing).toEqual({ included: true, days: 21 });
    expect(termSheetDataSchema.safeParse(d).success).toBe(true);
  });
  it('treats a null override as not included, and carries possession days', () => {
    const d = termSheetDefaults({ ...deal, possessionDaysAfterClosing: 5, periodOverrides: { financing: null } });
    expect(d.contingencies.financing).toEqual({ included: false, days: null });
    expect(d.possession).toEqual({ mode: 'days_after', days: 5 });
  });
});

describe('parseTermSheetForm', () => {
  it('accepts the prefilled defaults with a price and round-trips through dataToForm', () => {
    const r = parseTermSheetForm(form());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.price).toBe(850000);
    expect(parseTermSheetForm(dataToForm(r.data))).toEqual(r);
  });

  it('parses money with symbols, lists by line, and cash drops the down payment', () => {
    const r = parseTermSheetForm(
      form({
        price: '$1,050,000',
        itemsIncluded: 'Fridge\n\n  Washer ',
        questions: 'Q one\r\nQ two',
        financingType: 'cash',
        downPaymentPct: '20',
      }),
    );
    expect(r.ok && r.data.price).toBe(1050000);
    expect(r.ok && r.data.itemsIncluded).toEqual(['Fridge', 'Washer']);
    expect(r.ok && r.data.questions).toEqual(['Q one', 'Q two']);
    expect(r.ok && r.data.financing).toEqual({ type: 'cash', downPaymentPct: null });
  });

  it('validates money, percentages, days and dates', () => {
    expect(errs({ price: '-5' }).price).toBeDefined();
    expect(errs({ price: '12.5' }).price).toBeDefined();
    expect(errs({ price: '3000000000' }).price).toBeDefined();
    expect(errs({ downPaymentPct: '101' }).downPaymentPct).toBeDefined();
    expect(errs({ downPaymentPct: 'abc' }).downPaymentPct).toBeDefined();
    expect(errs({ inspection_days: '0' }).inspection_days).toBeDefined();
    expect(errs({ inspection_days: '61' }).inspection_days).toBeDefined();
    expect(errs({ closingDate: '2026-02-31' }).closingDate).toBeDefined();
    expect(errs({ address: ' ' }).address).toBeDefined();
    expect(errs({ pin: '123' }).pin).toBeDefined();
    expect(errs({ financingType: 'barter' }).financingType).toBeDefined();
  });

  it('requires days for included contingencies and ignores days when not included', () => {
    expect(errs({ hoaReview_included: 'on', hoaReview_days: '' }).hoaReview_days).toBeDefined();
    const r = parseTermSheetForm(form({ inspection_included: '', inspection_days: '30' }));
    expect(r.ok && r.data.contingencies.inspection).toEqual({ included: false, days: null });
  });

  it('possession days are required only for "days after"', () => {
    expect(errs({ possessionMode: 'days_after', possessionDays: '' }).possessionDays).toBeDefined();
    const r = parseTermSheetForm(form({ possessionMode: 'days_after', possessionDays: '7' }));
    expect(r.ok && r.data.possession).toEqual({ mode: 'days_after', days: 7 });
  });

  it('escalation is off by default; when on it needs an increment and a cap above the price', () => {
    const off = parseTermSheetForm(form({ escalation_increment: '5000', escalation_cap: '1' }));
    expect(off.ok && off.data.escalation).toEqual({ enabled: false, increment: null, cap: null });
    expect(errs({ escalation_enabled: 'on' }).escalation_increment).toBeDefined();
    expect(errs({ escalation_enabled: 'on', escalation_increment: '5000', escalation_cap: '800000' }).escalation_cap).toBeDefined();
    expect(errs({ escalation_enabled: 'on', escalation_increment: '9000', escalation_cap: '5000' }).escalation_cap).toBeDefined();
    const ok = parseTermSheetForm(form({ escalation_enabled: 'on', escalation_increment: '5000', escalation_cap: '900000' }));
    expect(ok.ok && ok.data.escalation).toEqual({ enabled: true, increment: 5000, cap: 900000 });
  });

  it('limits list length and text size', () => {
    expect(errs({ questions: Array(31).fill('q').join('\n') }).questions).toBeDefined();
    expect(errs({ notes: 'x'.repeat(5001) }).notes).toBeDefined();
  });

  it('error messages are neutral copy', () => {
    const all = Object.values(errs({ price: 'x', inspection_days: '0', downPaymentPct: '999', closingDate: 'bad', pin: '1' }));
    for (const m of all) expect(findBanned(m)).toEqual([]);
  });
});

describe('unchecked contingencies', () => {
  it('ignores an out-of-range days value when the contingency is not included', () => {
    const r = parseTermSheetForm({ address: '1 Test St', financingType: 'cash', possessionMode: 'on_closing', inspection_days: '999' });
    expect(r.ok).toBe(true);
  });
  it('still validates days when the contingency is included', () => {
    const r = parseTermSheetForm({ address: '1 Test St', financingType: 'cash', possessionMode: 'on_closing', inspection_included: 'on', inspection_days: '999' });
    expect(r.ok).toBe(false);
  });
});
