import { describe, expect, it } from 'vitest';
import { safeNext, signInDecision } from './auth-policy';

describe('signInDecision', () => {
  it('lets anyone in when public signup is on', () => {
    expect(signInDecision('x@y.com', true, [])).toEqual({ allowed: true, createUser: true });
  });
  it('allows allowlisted emails case-insensitively when signup is off', () => {
    expect(signInDecision('  Jon@Example.com ', false, ['jon@example.com'])).toEqual({ allowed: true, createUser: true });
  });
  it('refuses everyone else when signup is off', () => {
    expect(signInDecision('other@example.com', false, ['jon@example.com'])).toEqual({
      allowed: false,
      reason: 'not_invited',
    });
  });
});

describe('safeNext', () => {
  it.each([
    [null, '/deals'],
    ['', '/deals'],
    ['https://evil.com', '/deals'],
    ['//evil.com', '/deals'],
    ['/\\evil.com', '/deals'],
    ['/deals/123', '/deals/123'],
  ])('%s -> %s', (input, out) => {
    expect(safeNext(input)).toBe(out);
  });
});
