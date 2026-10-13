// Comps statistics. Pure. Descriptive arithmetic only: no point estimate, no "value".

import { MIN_COMPS_FOR_RANGE } from './codes';

export type StatInput = { salePrice: number; sqFtLiving: number };

export type CompStats = {
  count: number;
  /** Per-comp $/sq ft, same order as the input. */
  pricesPerSqft: number[];
  median: number | null;
  p25: number | null;
  p75: number | null;
  /** p25 x subject sq ft ... p75 x subject sq ft, each rounded to the nearest $5,000. */
  range: { low: number; high: number } | null;
  /** Set when there is no range, in plain English. */
  rangeNote: string | null;
};

export const pricePerSqft = (price: number, sqft: number) => price / sqft;

/** Linear-interpolation percentile (p in 0..1) of an ascending-sorted array. */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new Error('percentile of empty list');
  if (sorted.length === 1) return sorted[0]!;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const frac = idx - lo;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * frac;
}

export const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export function computeStats(comps: readonly StatInput[], subjectSqFt: number | null): CompStats {
  const prices = comps.map((c) => pricePerSqft(c.salePrice, c.sqFtLiving));
  const count = comps.length;
  if (count === 0) {
    return {
      count,
      pricesPerSqft: prices,
      median: null,
      p25: null,
      p75: null,
      range: null,
      rangeNote: 'There are too few comparable sales for a range.',
    };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const p25 = percentile(sorted, 0.25);
  const p75 = percentile(sorted, 0.75);

  let range: CompStats['range'] = null;
  let rangeNote: string | null = null;
  if (count < MIN_COMPS_FOR_RANGE) {
    rangeNote = `There are too few comparable sales for a range (${count} found, at least ${MIN_COMPS_FOR_RANGE} needed).`;
  } else if (!subjectSqFt || subjectSqFt <= 0) {
    rangeNote = "A range needs this home's living area, which is not in the county data.";
  } else {
    range = { low: roundTo(p25 * subjectSqFt, 5000), high: roundTo(p75 * subjectSqFt, 5000) };
  }
  return { count, pricesPerSqft: prices, median, p25, p75, range, rangeNote };
}
