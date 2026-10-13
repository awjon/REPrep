import { describe, expect, it } from 'vitest';
import { computeStats, percentile, roundTo } from '@/lib/comps/stats';

const comps = (ppsf: number[]) => ppsf.map((p) => ({ salePrice: p * 1000, sqFtLiving: 1000 }));

describe('percentile', () => {
  it('interpolates linearly with an odd count', () => {
    const s = [10, 20, 30, 40, 50];
    expect(percentile(s, 0.5)).toBe(30);
    expect(percentile(s, 0.25)).toBe(20);
    expect(percentile(s, 0.75)).toBe(40);
  });
  it('interpolates linearly with an even count', () => {
    const s = [10, 20, 30, 40];
    expect(percentile(s, 0.5)).toBe(25);
    expect(percentile(s, 0.25)).toBeCloseTo(17.5);
    expect(percentile(s, 0.75)).toBeCloseTo(32.5);
  });
  it('handles one value and rejects empty', () => {
    expect(percentile([7], 0.9)).toBe(7);
    expect(() => percentile([], 0.5)).toThrow();
  });
});

describe('computeStats', () => {
  it('computes per-comp $/sqft, count, quartiles and a rounded range', () => {
    const s = computeStats(comps([500, 600, 700, 800, 900, 1000]), 1840);
    expect(s.count).toBe(6);
    expect(s.pricesPerSqft).toEqual([500, 600, 700, 800, 900, 1000]);
    expect(s.median).toBe(750);
    expect(s.p25).toBe(625);
    expect(s.p75).toBe(875);
    // 625*1840 = 1,150,000 ; 875*1840 = 1,610,000
    expect(s.range).toEqual({ low: 1_150_000, high: 1_610_000 });
    expect(s.rangeNote).toBeNull();
  });

  it('keeps input order for per-comp values but sorts for percentiles', () => {
    const s = computeStats(comps([900, 500, 700, 600, 800]), 1000);
    expect(s.pricesPerSqft).toEqual([900, 500, 700, 600, 800]);
    expect(s.median).toBe(700);
  });

  it('rounds the range to the nearest $5,000', () => {
    const s = computeStats(comps([601, 602, 603, 604, 605]), 1234);
    // p25 = 602 -> 742,868 -> 745,000 ; p75 = 604 -> 745,336 -> 745,000
    expect(s.range).toEqual({ low: 745_000, high: 745_000 });
    expect(roundTo(742_500, 5000)).toBe(745_000);
    expect(roundTo(742_499, 5000)).toBe(740_000);
  });

  it('gives no range under five comps and says so', () => {
    const s = computeStats(comps([600, 700, 800, 900]), 1500);
    expect(s.count).toBe(4);
    expect(s.median).toBe(750);
    expect(s.range).toBeNull();
    expect(s.rangeNote).toMatch(/too few comparable sales for a range/);
  });

  it('handles zero comps', () => {
    const s = computeStats([], 1500);
    expect(s).toMatchObject({ count: 0, median: null, p25: null, p75: null, range: null });
    expect(s.rangeNote).toMatch(/too few/);
  });

  it('gives no range without the subject living area', () => {
    const s = computeStats(comps([1, 2, 3, 4, 5]), null);
    expect(s.range).toBeNull();
    expect(s.median).toBe(3);
    expect(s.rangeNote).toMatch(/living area/);
  });
});
