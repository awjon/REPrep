import { describe, expect, it } from 'vitest';
import { addressPatterns, normalizeAddress } from '@/lib/comps/address';
import { bathsLabel, bathsValue, monthsAgo } from '@/lib/comps/format';
import { boundingBox, haversineMiles } from '@/lib/comps/geo';
import { methodString, sqftBand } from '@/lib/comps/method';
import { DEFAULT_PARAMS, paramsFromJson, paramsToSearch, parseCompParams } from '@/lib/comps/params';
import { statsSentences } from '@/lib/comps/summary';
import { computeStats } from '@/lib/comps/stats';
import { findBanned } from '@/lib/legal/banned-phrases';
import { DISCLAIMER_TEXT } from '@/lib/legal/disclaimer';
import type { Subject } from '@/lib/comps/types';

const subject: Subject = {
  pin: '9900000001',
  address: '1234 ALKI AVE SW',
  zip: '98116',
  area: 15,
  subArea: 3,
  lat: 47.58,
  lon: -122.41,
  sqFtLot: 5000,
  presentUse: 2,
  sqFtLiving: 1840,
  bedrooms: 3,
  baths: 2.75,
  yrBuilt: 1962,
  grade: 8,
  livingUnits: 1,
};

describe('normalizeAddress', () => {
  it('uppercases, collapses spaces and abbreviates', () => {
    expect(normalizeAddress('  1234  alki   avenue southwest ')).toBe('1234 ALKI AVE SW');
    expect(normalizeAddress('55 North 45th Street')).toBe('55 N 45TH ST');
    expect(normalizeAddress('9 Lake Washington Boulevard, Apt. #4')).toBe('9 LAKE WASHINGTON BLVD APT 4');
  });
  it('returns empty for blank input', () => {
    expect(normalizeAddress('   ')).toBe('');
  });
  it('builds escaped LIKE patterns', () => {
    const p = addressPatterns('100% oak_st');
    expect(p.prefix[0]).toBe('100\\% OAK\\_ST%');
    expect(p.contains[0]).toBe('%100\\% OAK\\_ST%');
    expect(addressPatterns('1 Main St').prefix).toEqual(['1 MAIN ST%']);
  });
});

describe('haversine and bounding box', () => {
  it('is zero for the same point', () => {
    expect(haversineMiles(47.6, -122.3, 47.6, -122.3)).toBe(0);
  });
  it('matches a known distance (Seattle to Tacoma, about 25 miles)', () => {
    const d = haversineMiles(47.6062, -122.3321, 47.2529, -122.4443);
    expect(d).toBeGreaterThan(24);
    expect(d).toBeLessThan(27);
  });
  it('one degree of latitude is about 69 miles', () => {
    expect(haversineMiles(47, -122, 48, -122)).toBeCloseTo(69.09, 1);
  });
  it('the bounding box contains the circle', () => {
    const b = boundingBox(47.6, -122.3, 1);
    const north = haversineMiles(47.6, -122.3, b.maxLat, -122.3);
    expect(north).toBeCloseTo(1, 1);
    const east = haversineMiles(47.6, -122.3, 47.6, b.maxLon);
    expect(east).toBeGreaterThanOrEqual(0.99);
  });
});

describe('format helpers', () => {
  it('combines baths and labels them', () => {
    expect(bathsValue(2, 1, 0)).toBe(2.75);
    expect(bathsValue(1, 0, 1)).toBe(1.5);
    expect(bathsValue(null, null, null)).toBeNull();
    expect(bathsLabel(2.75)).toBe('2.75');
    expect(bathsLabel(2)).toBe('2');
    expect(bathsLabel(null)).toBe('—');
  });
  it('subtracts months with day clamping', () => {
    expect(monthsAgo('2026-10-12', 12)).toBe('2025-10-12');
    expect(monthsAgo('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsAgo('2026-01-15', 6)).toBe('2025-07-15');
  });
});

describe('params', () => {
  it('uses defaults and ignores invalid values', () => {
    expect(parseCompParams({})).toEqual(DEFAULT_PARAMS);
    expect(parseCompParams({ months: '7', sqft: 'x', loc: '3' })).toEqual(DEFAULT_PARAMS);
  });
  it('round-trips through the query string', () => {
    const p = parseCompParams({ months: '24', sqft: '40', loc: '0.5', yr: '1', beds: '1' });
    expect(p).toEqual({ months: 24, sqftPct: 40, location: { kind: 'radius', miles: 0.5 }, yearWindow: 20, sameBeds: true });
    expect(parseCompParams(Object.fromEntries(new URLSearchParams(paramsToSearch(p))))).toEqual(p);
    expect(paramsFromJson(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(paramsFromJson(null)).toEqual(DEFAULT_PARAMS);
  });
});

describe('method string', () => {
  it('lists the default filters', () => {
    const m = methodString(DEFAULT_PARAMS, subject, 1);
    expect(m).toContain('last 12 months');
    expect(m).toContain('warning code');
    expect(m).toContain('more than one parcel');
    expect(m).toContain('single residential building and 1 living unit');
    expect(m).toContain('area 15, sub-area 3');
    expect(m).toContain('within 25% of 1,840 sq ft (1,380 to 2,300)');
    expect(m).toContain('50 most recent');
    expect(m).not.toContain('built within');
  });
  it('lists optional filters and radius', () => {
    const m = methodString(
      { months: 6, sqftPct: 15, location: { kind: 'radius', miles: 0.25 }, yearWindow: 20, sameBeds: true },
      subject,
      2,
    );
    expect(m).toContain('2 living units');
    expect(m).toContain('within 0.25 miles of this home');
    expect(m).toContain('built within 20 years of 1962');
    expect(m).toContain('bedrooms within 1 of 3');
  });
  it('falls back to area wording when the subject has no location', () => {
    const m = methodString({ ...DEFAULT_PARAMS, location: { kind: 'radius', miles: 1 } }, subject, 1, true);
    expect(m).toContain('same assessor area');
  });
  it('computes the band', () => {
    expect(sqftBand(1000, 25)).toEqual({ min: 750, max: 1250 });
  });
});

describe('comps copy is descriptive', () => {
  it('summary sentences read as described and are clean', () => {
    const comps = Array.from({ length: 14 }, (_, i) => ({ salePrice: (571 + i * 6) * 1840, sqFtLiving: 1840 }));
    const lines = statsSentences(computeStats(comps, 1840), 1840);
    expect(lines[0]).toBe('Comparable recorded sales: 14.');
    expect(lines[1]).toMatch(/^Price per living sq ft: median \$\d+, middle half \$\d+–\$\d+\.$/);
    expect(lines[2]).toMatch(/^Middle-half price per sq ft × this home's 1,840 sq ft = \$[\d,]+–\$[\d,]+ \(arithmetic only, not a valuation\)\.$/);
    for (const l of lines) expect(findBanned(l)).toEqual([]);
  });
  it('the too-few note is clean and the comps disclaimer stands', () => {
    const lines = statsSentences(computeStats([], 1000), 1000);
    expect(lines.join(' ')).toMatch(/too few comparable sales for a range/);
    for (const l of lines) expect(findBanned(l)).toEqual([]);
    expect(findBanned(methodString(DEFAULT_PARAMS, subject, 1))).toEqual([]);
    expect(DISCLAIMER_TEXT.comps).toMatch(/not an appraisal/);
  });
});
