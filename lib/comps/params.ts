// Filter parameters: parse from URL search params (invalid values fall back to defaults) and
// serialize back, so every result page is linkable.

import type { CompLocation, CompParams } from './types';

export const MONTH_OPTIONS = [6, 12, 24] as const;
export const SQFT_OPTIONS = [15, 25, 40] as const;
export const RADIUS_OPTIONS = [0.25, 0.5, 1] as const;
export const YEAR_WINDOW = 20;

export const DEFAULT_PARAMS: CompParams = {
  months: 12,
  sqftPct: 25,
  location: { kind: 'area' },
  yearWindow: null,
  sameBeds: false,
};

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function pick<T extends number>(v: string | undefined, options: readonly T[], fallback: T): T {
  const n = Number(v);
  return (options as readonly number[]).includes(n) ? (n as T) : fallback;
}

export function parseCompParams(raw: Raw): CompParams {
  const loc = one(raw.loc);
  let location: CompLocation = DEFAULT_PARAMS.location;
  if (loc && loc !== 'area') {
    const miles = Number(loc);
    if ((RADIUS_OPTIONS as readonly number[]).includes(miles)) location = { kind: 'radius', miles };
  }
  return {
    months: pick(one(raw.months), MONTH_OPTIONS, DEFAULT_PARAMS.months),
    sqftPct: pick(one(raw.sqft), SQFT_OPTIONS, DEFAULT_PARAMS.sqftPct),
    location,
    yearWindow: one(raw.yr) === '1' ? YEAR_WINDOW : null,
    sameBeds: one(raw.beds) === '1',
  };
}

export function paramsToSearch(p: CompParams): string {
  const q = new URLSearchParams();
  q.set('months', String(p.months));
  q.set('sqft', String(p.sqftPct));
  q.set('loc', p.location.kind === 'area' ? 'area' : String(p.location.miles));
  if (p.yearWindow !== null) q.set('yr', '1');
  if (p.sameBeds) q.set('beds', '1');
  return q.toString();
}

/** Rebuild params from a saved snapshot (tolerates unexpected JSON). */
export function paramsFromJson(json: unknown): CompParams {
  const o = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const loc = o.location as { kind?: string; miles?: unknown } | undefined;
  return parseCompParams({
    months: String(o.months ?? ''),
    sqft: String(o.sqftPct ?? ''),
    loc: loc?.kind === 'radius' ? String(loc.miles) : 'area',
    yr: o.yearWindow ? '1' : undefined,
    beds: o.sameBeds ? '1' : undefined,
  });
}
