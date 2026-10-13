// Street-address normalization for the parcel search. Pure.
// The assessor extracts store uppercase, whitespace-collapsed addresses; search input is
// normalized the same way and common suffix / direction words are abbreviated.

const WORDS: Record<string, string> = {
  AVENUE: 'AVE',
  STREET: 'ST',
  SOUTHWEST: 'SW',
  SOUTHEAST: 'SE',
  NORTHWEST: 'NW',
  NORTHEAST: 'NE',
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  ROAD: 'RD',
  DRIVE: 'DR',
  LANE: 'LN',
  COURT: 'CT',
  PLACE: 'PL',
  BOULEVARD: 'BLVD',
  TERRACE: 'TER',
  CIRCLE: 'CIR',
  PARKWAY: 'PKWY',
  HIGHWAY: 'HWY',
  WAY: 'WAY',
};

/** Uppercase, strip punctuation, collapse spaces, abbreviate common words. */
export function normalizeAddress(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(' ')
    .map((w) => WORDS[w] ?? w)
    .join(' ');
}

/** Uppercase and collapse spaces only (matches how the extract stores addresses). */
export function plainUpper(input: string): string {
  return input.toUpperCase().replace(/\s+/g, ' ').trim();
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Distinct LIKE patterns for a search: [normalized-prefix, original-prefix, normalized-contains]. */
export function addressPatterns(input: string): { prefix: string[]; contains: string[] } {
  const norm = normalizeAddress(input);
  const plain = plainUpper(input);
  const prefix = [...new Set([norm, plain].filter(Boolean))].map((s) => `${escapeLike(s)}%`);
  const contains = [...new Set([norm, plain].filter(Boolean))].map((s) => `%${escapeLike(s)}%`);
  return { prefix, contains };
}

export const MIN_SEARCH_LENGTH = 3;
