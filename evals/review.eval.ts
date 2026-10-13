// Live evaluation of the document review prompts against synthetic documents.
// Costs real tokens (~$0.05 per run). Skips unless ANTHROPIC_API_KEY is set.
//   ANTHROPIC_API_KEY=… npm run eval:review
// Run after any change to lib/review/prompts/** and record the result in the PR.

import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { findBanned } from '@/lib/legal/banned-phrases';
import { reviewDocument, type MessagesClient } from '@/lib/review/pipeline';
import { makePdf, SAMPLE_DISCLOSURE } from '@/tests/fixtures/pdf';

const key = process.env.ANTHROPIC_API_KEY;
const models = {
  review: process.env.MODEL_REVIEW ?? 'claude-sonnet-5-5',
  triage: process.env.MODEL_TRIAGE ?? 'claude-haiku-4-5-20251001',
};

const SAMPLE_INSPECTION = [
  `HOME INSPECTION REPORT (sample for testing)
Summary of significant items
1. Electrical: The main panel is a Federal Pacific Stab-Lok panel. Recommend evaluation by a licensed electrician.
2. Roof: Composition shingles show granule loss and curling; estimated remaining life 0-3 years.`,
  `3. Crawlspace: Standing water observed below the kitchen; efflorescence on the foundation wall.
4. Water heater: Installed 2009; not seismically strapped.
5. Attic: Not accessed — hatch was sealed with paint.`,
];

describe.skipIf(!key)('review prompts — live eval', () => {
  const client = new Anthropic({ apiKey: key }) as unknown as MessagesClient;

  const check = async (pages: string[], expectType: string, mustFind: { page: number; re: RegExp }[]) => {
    const r = await reviewDocument({ pdf: await makePdf(pages), docType: 'unknown', client, models });
    expect(r.docType).toBe(expectType);
    for (const m of mustFind) {
      expect(
        r.findings.some((f) => f.page === m.page && m.re.test(`${f.category} ${f.summary} ${f.quote}`)),
        `expected a page ${m.page} finding matching ${m.re}`,
      ).toBe(true);
    }
    for (const f of r.findings) {
      expect(f.quoteVerified).toBe(true); // text PDFs: every shown quote must be verified
      expect(findBanned(`${f.summary} ${f.questionToAsk}`)).toEqual([]);
      expect(f.questionToAsk).toMatch(/^Ask /);
    }
    // Most raw findings should survive citation checks; a low ratio means the prompt drifted.
    expect(r.dropped).toBeLessThanOrEqual(Math.max(2, Math.ceil(r.findings.length * 0.3)));
    console.log(`${expectType}: kept=${r.findings.length} dropped=${r.dropped} cost=$${r.costUsd} ${JSON.stringify(r.dropReasons)}`);
    return r;
  };

  it('seller disclosure', { timeout: 180_000 }, async () => {
    await check(SAMPLE_DISCLOSURE, 'form17', [
      { page: 1, re: /water|leak|seep/i },
      { page: 1, re: /sewer/i },
      { page: 2, re: /oil|tank/i },
      { page: 2, re: /fence|encroach|boundar/i },
    ]);
  });

  it('inspection report', { timeout: 180_000 }, async () => {
    await check(SAMPLE_INSPECTION, 'inspection', [
      { page: 1, re: /federal pacific|panel|electric/i },
      { page: 1, re: /roof/i },
      { page: 2, re: /standing water|crawl/i },
      { page: 2, re: /attic|not accessed/i },
    ]);
  });
});
