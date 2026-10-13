import { describe, expect, it } from 'vitest';
import { findBanned, isClean } from './banned-phrases';

describe('banned phrases', () => {
  it.each([
    'You should offer $850,000.',
    'We recommend asking for a credit.',
    'I suggest you waive the inspection.',
    'It is recommended that you terminate the contract.',
    'Offer no more than $900k',
    'Buyers should offer less given the roof.',
    'The fair value is $1.1M.',
    'This home is worth more than the list price.',
    'The house looks overpriced.',
    'Demand a credit for the furnace.',
    'Consider whether to walk away.',
    'This is a material defect.',
    "It's safe to waive this contingency.",
    "You don't need an attorney for this.",
    'You need to sign by Friday.',
    // leaked past v1 of the filter (independent review, 2026-10-12)
    'Ask the seller for a price reduction to cover the sewer repair.',
    'Ask the seller to credit you $8,000 at closing.',
    'This is a significant defect.',
    'This easement violates the setback rules.',
    'Consider waiving the inspection contingency.',
    'Use this finding as leverage in negotiations.',
    'This could justify a lower offer.',
    'Ask the seller to repair the furnace before closing.',
  ])('flags: %s', (text) => {
    expect(isClean(text)).toBe(false);
  });

  it.each([
    'Comparable sales ranged from $820,000 to $910,000.',
    'This item is commonly raised with an attorney.',
    'The report notes moisture in the crawlspace (page 14).',
    'Question to ask: when was the roof last replaced?',
    'Inspection contingency ends Oct 19 at 9:00 pm. Computed — confirm against your contract.',
    'Not legal advice. Confirm with a Washington real estate attorney.',
    'The seller marked "unknown" for the septic question.',
    'Ask the seller when the furnace was last serviced and whether records exist.',
    'Ask your inspector whether the panel brand has known service issues.',
    'The report lists granule loss on the south roof slope.',
  ])('allows: %s', (text) => {
    expect(findBanned(text)).toEqual([]);
  });
});
