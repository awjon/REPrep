import { describe, expect, it } from 'vitest';
import { checkBearer } from '@/lib/jobs/auth';

const T = 'a'.repeat(43);

describe('checkBearer', () => {
  it('accepts the right token', () => expect(checkBearer(`Bearer ${T}`, T)).toBe(true));
  it('rejects a wrong token of the same length', () => expect(checkBearer(`Bearer ${'b'.repeat(43)}`, T)).toBe(false));
  it('rejects wrong lengths without throwing', () => {
    expect(checkBearer('Bearer short', T)).toBe(false);
    expect(checkBearer(`Bearer ${T}extra`, T)).toBe(false);
  });
  it('rejects a missing or empty header', () => {
    expect(checkBearer(null, T)).toBe(false);
    expect(checkBearer('', T)).toBe(false);
    expect(checkBearer('Bearer ', T)).toBe(false);
  });
  it('rejects other schemes and a bare token', () => {
    expect(checkBearer(`Basic ${T}`, T)).toBe(false);
    expect(checkBearer(T, T)).toBe(false);
  });
  it('tolerates scheme casing and surrounding whitespace', () => {
    expect(checkBearer(`bearer ${T}`, T)).toBe(true);
    expect(checkBearer(`BEARER   ${T}  `, T)).toBe(true);
  });
  it('never accepts when the expected token is empty', () => expect(checkBearer('Bearer x', '')).toBe(false));
});
