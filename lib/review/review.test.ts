import { beforeAll, describe, expect, it, vi } from 'vitest';
import { findBanned } from '@/lib/legal/banned-phrases';
import { makeBlankPdf, makePdf, SAMPLE_DISCLOSURE } from '@/tests/fixtures/pdf';
import { costUsd } from './cost';
import { isMostlyScanned, isPdf, pageTexts, scannedPages, splitPdf } from './pdf';
import { guessDocType, reviewDocument, ReviewError, type MessagesClient } from './pipeline';
import { promptVersion, TYPE_PROMPTS, userInstruction } from './prompts';
import { SYSTEM_PROMPT } from './prompts/shared';
import { normalizeForMatch, quoteOnPage, validateFindings } from './validate';

const finding = (over: Record<string, unknown> = {}) => ({
  severity: 'high',
  category: 'Water intrusion',
  summary: 'The seller reports water came in along the north wall during heavy rain.',
  page: 1,
  quote: 'Water came in along the north wall during heavy rain in 2023',
  question_to_ask: 'Ask the seller whether water has entered since the sump pump was installed.',
  ...over,
});

describe('quote matching', () => {
  it('normalizes case, punctuation, quotes and line-break hyphenation', () => {
    expect(normalizeForMatch('The  “Roof” was re-\nplaced, in 2011.')).toBe('the roof was replaced in 2011');
  });
  it.each([
    ['exact', 'The roof was replaced in 2011', true],
    ['different spacing/case', 'the ROOF   was replaced in 2011.', true],
    ['ellipsis (stitched fragments) rejected', 'Has the roof … was replaced in 2011', false],
    ['too few words to prove anything', 'the roof was', false],
    ['four words but too short', 'roof was in 2011', false],
    ['not on page', 'The roof was replaced in 2015', false],
    ['only punctuation', '......', false],
  ])('%s', (_l, quote, ok) => {
    expect(quoteOnPage(quote, '7. Has the roof been replaced? The roof was replaced in 2011.')).toBe(ok);
  });
});

describe('validateFindings', () => {
  const texts = ['Water came in along the north wall during heavy rain in 2023; seller installed a sump pump.', '', 'Page three text: the neighbor fence sits two feet onto the lot.'];

  it('keeps a well-cited finding and marks it verified', () => {
    const r = validateFindings([{ raw: [finding()], pageOffset: 0, pageCount: 3 }], texts);
    expect(r.dropped).toEqual([]);
    expect(r.kept[0]).toMatchObject({ page: 1, quoteVerified: true, questionToAsk: expect.stringMatching(/^Ask the seller/) });
  });

  it('drops malformed findings (missing page / bad severity / too-short quote)', () => {
    const raw = [finding({ page: undefined }), finding({ severity: 'critical' }), finding({ quote: 'short' })];
    const r = validateFindings([{ raw, pageOffset: 0, pageCount: 3 }], texts);
    expect(r.kept).toHaveLength(0);
    expect(r.dropped.map((d) => d.reason)).toEqual(['malformed', 'malformed', 'malformed']);
  });

  it('drops a page outside the chunk', () => {
    const r = validateFindings([{ raw: [finding({ page: 4 })], pageOffset: 0, pageCount: 3 }], texts);
    expect(r.dropped).toEqual([{ reason: 'page_out_of_range', page: 4 }]);
  });

  it('drops a quote that is not on the cited page (uncited / hallucinated)', () => {
    const r = validateFindings([{ raw: [finding({ page: 3 })], pageOffset: 0, pageCount: 3 }], texts);
    expect(r.dropped).toEqual([{ reason: 'quote_not_on_page', page: 3 }]);
  });

  it('applies the chunk page offset before checking the quote', () => {
    const raw = [finding({ page: 1, quote: 'the neighbor fence sits two feet onto the lot' })];
    const r = validateFindings([{ raw, pageOffset: 2, pageCount: 1 }], texts);
    expect(r.kept[0]!.page).toBe(3);
  });

  it('keeps findings on pages with no text layer but marks them unverified', () => {
    const r = validateFindings([{ raw: [finding({ page: 2, quote: 'anything the model read off the image' })], pageOffset: 0, pageCount: 3 }], texts);
    expect(r.kept[0]).toMatchObject({ page: 2, quoteVerified: false });
  });

  it.each([
    { summary: 'You should ask for a credit because of the water.' },
    { question_to_ask: 'We recommend you walk away from this house.' },
    { summary: 'This is a material defect in the foundation of the home.' },
  ])('drops advice language: %o', (over) => {
    const r = validateFindings([{ raw: [finding(over)], pageOffset: 0, pageCount: 3 }], texts);
    expect(r.dropped[0]!.reason).toBe('advice_language');
  });

  it('dedupes the same quote on the same page across chunks and sorts by severity then page', () => {
    const r = validateFindings(
      [
        { raw: [finding({ severity: 'low' }), finding()], pageOffset: 0, pageCount: 3 },
        { raw: [finding({ page: 1, quote: 'the neighbor fence sits two feet onto the lot', severity: 'medium' })], pageOffset: 2, pageCount: 1 },
      ],
      texts,
    );
    expect(r.dropped.map((d) => d.reason)).toEqual(['duplicate']);
    expect(r.kept.map((k) => `${k.severity}@${k.page}`)).toEqual(['medium@3', 'low@1']);
  });
});

describe('cost', () => {
  it('prices known models per million tokens', () => {
    expect(costUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 100_000 })).toBeCloseTo(3);
    expect(costUsd('claude-haiku-4-5-20251001', { inputTokens: 200_000, outputTokens: 0 })).toBeCloseTo(0.2);
  });
  it('returns null for unknown models', () => {
    expect(costUsd('some-other-model', { inputTokens: 1, outputTokens: 1 })).toBeNull();
  });
});

describe('prompts', () => {
  it('system prompt requires verbatim quotes and pages and forbids advice', () => {
    expect(SYSTEM_PROMPT).toMatch(/verbatim quote/);
    expect(SYSTEM_PROMPT).toMatch(/page number/);
    expect(SYSTEM_PROMPT).toMatch(/never advise/i);
  });
  it('type prompts and instructions are free of advice language', () => {
    for (const t of Object.keys(TYPE_PROMPTS) as (keyof typeof TYPE_PROMPTS)[]) {
      expect(findBanned(TYPE_PROMPTS[t].focus)).toEqual([]);
      expect(promptVersion(t)).toMatch(/^s\d+\.\w+\.v\d+$/);
    }
  });
  it('tells the model about excerpt offsets', () => {
    expect(userInstruction('inspection', 50, 50)).toMatch(/page 51 of the full document/);
    expect(userInstruction('inspection', 0, 1)).not.toMatch(/excerpt/);
    expect(userInstruction('inspection', 0, 1)).toMatch(/1 page\./);
  });
});

describe('pdf utilities', () => {
  let pdf: Uint8Array;
  beforeAll(async () => {
    pdf = await makePdf(SAMPLE_DISCLOSURE);
  });

  it('extracts per-page text', async () => {
    const t = await pageTexts(pdf);
    expect(t).toHaveLength(3);
    expect(normalizeForMatch(t[1]!)).toMatch(/oil tank was decommissioned/);
    expect(isPdf(pdf)).toBe(true);
    expect(isPdf(new TextEncoder().encode('hello'))).toBe(false);
  });

  it('detects pages without a text layer', async () => {
    const blank = await pageTexts(await makeBlankPdf(2));
    expect(scannedPages(blank)).toEqual([true, true]);
    expect(isMostlyScanned(blank)).toBe(true);
    expect(isMostlyScanned(await pageTexts(pdf))).toBe(false);
    expect(isMostlyScanned([])).toBe(false);
  });

  it('splits long documents into chunks with offsets', async () => {
    const chunks = await splitPdf(await makeBlankPdf(120), 50);
    expect(chunks.map((c) => [c.pageOffset, c.pageCount])).toEqual([
      [0, 50],
      [50, 50],
      [100, 20],
    ]);
    expect((await splitPdf(pdf, 50))[0]!.bytes).toBe(pdf); // short docs are not re-encoded
  });
});

// ---------- pipeline with a fake model ----------

function fakeClient(responder: (args: { model: string; tool: string; text: string }) => { input: unknown; in?: number; out?: number }) {
  const create = vi.fn(async (args: Parameters<MessagesClient['messages']['create']>[0]) => {
    const tool = args.tool_choice.name;
    const text = (args.messages[0]!.content.find((c) => (c as { type: string }).type === 'text') as { text: string }).text;
    const r = responder({ model: args.model, tool, text });
    return {
      content: [{ type: 'tool_use', name: tool, input: r.input }],
      usage: { input_tokens: r.in ?? 10_000, output_tokens: r.out ?? 1_000 },
    };
  });
  return { client: { messages: { create } } as MessagesClient, create };
}

const models = { review: 'claude-sonnet-5-5', triage: 'claude-haiku-4-5-20251001' };

describe('reviewDocument', () => {
  let pdf: Uint8Array;
  beforeAll(async () => {
    pdf = await makePdf(SAMPLE_DISCLOSURE);
  });

  it('recognizes the type from page 1 without a model call, reviews, validates, and costs the run', async () => {
    const { client, create } = fakeClient(() => ({
      input: {
        findings: [
          finding(),
          finding({ page: 2, severity: 'medium', category: 'Environmental', quote: 'An oil tank was decommissioned in place in 2019', summary: 'The seller reports an oil tank decommissioned in place in 2019.', question_to_ask: 'Ask the seller for the decommissioning certificate.' }),
          finding({ page: 3, quote: 'This sentence is not anywhere in the document at all' }), // hallucinated
          { severity: 'low', summary: 'no page or quote' }, // uncited
        ],
      },
    }));
    const events: string[] = [];
    const r = await reviewDocument({ pdf, docType: 'unknown', client, models, onProgress: (p) => events.push(p.stage) });
    expect(create).toHaveBeenCalledTimes(1); // no triage call: page 1 says "Seller disclosure statement"
    expect(r.docType).toBe('form17');
    expect(r.promptVersion).toBe(promptVersion('form17'));
    expect(r.findings.map((f) => f.page)).toEqual([1, 2]);
    expect(r.dropped).toBe(2);
    expect(r.dropReasons).toEqual({ quote_not_on_page: 1, malformed: 1 });
    expect(r.pagesReviewed).toBe(3);
    expect(r.usage).toEqual({ inputTokens: 10_000, outputTokens: 1_000 });
    expect(r.costUsd).toBeCloseTo(0.03);
    expect(events).toEqual(['reading', 'classified', 'reviewing', 'validating']);
  });

  it('uses the triage model only when the type cannot be guessed', async () => {
    const generic = await makePdf(['Report about a house. The furnace is 25 years old according to the label.']);
    const { client, create } = fakeClient(({ tool }) =>
      tool === 'record_document_type' ? { input: { doc_type: 'inspection' }, in: 2_000, out: 20 } : { input: { findings: [] } },
    );
    const r = await reviewDocument({ pdf: generic, docType: 'unknown', client, models });
    expect(create.mock.calls[0]![0].model).toBe(models.triage);
    expect(create.mock.calls[1]![0].model).toBe(models.review);
    expect(r.docType).toBe('inspection');
    expect(r.usage).toEqual({ inputTokens: 12_000, outputTokens: 1_020 });
  });

  it('refuses documents that are not a supported type', async () => {
    const generic = await makePdf(['A grocery list: apples, bread, milk, and coffee for the week.']);
    const { client } = fakeClient(() => ({ input: { doc_type: 'other' } }));
    await expect(reviewDocument({ pdf: generic, docType: 'unknown', client, models })).rejects.toMatchObject({
      code: 'unsupported_type',
    });
  });

  it('skips classification when the user chose the type', async () => {
    const { client, create } = fakeClient(() => ({ input: { findings: [] } }));
    const r = await reviewDocument({ pdf, docType: 'hoa', client, models });
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.docType).toBe('hoa');
  });

  it('reviews long documents in chunks and maps pages back', async () => {
    const pages = Array.from({ length: 60 }, (_, i) => `Page ${i + 1} body. Inspector note number ${i + 1} about the attic ventilation.`);
    const long = await makePdf(pages);
    const { client, create } = fakeClient(({ text }) => {
      const excerpt = /page (\d+) of the full document/.exec(text);
      const offset = excerpt ? Number(excerpt[1]) - 1 : 0;
      const n = 3; // cite the 3rd page of each chunk
      return {
        input: {
          findings: [
            finding({ page: n, category: 'Attic', quote: `Inspector note number ${offset + n} about the attic ventilation`, summary: 'The report notes attic ventilation.', question_to_ask: 'Ask your inspector what was observed in the attic.' }),
          ],
        },
      };
    });
    const r = await reviewDocument({ pdf: long, docType: 'inspection', client, models });
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.findings.map((f) => f.page).sort((a, b) => a - b)).toEqual([3, 53]);
    expect(r.dropped).toBe(0);
  });

  it('treats a missing tool call as a model error', async () => {
    const client = {
      messages: { create: async () => ({ content: [{ type: 'text' }], usage: { input_tokens: 1, output_tokens: 1 } }) },
    } as MessagesClient;
    await expect(reviewDocument({ pdf, docType: 'form17', client, models })).rejects.toBeInstanceOf(ReviewError);
  });

  it('tolerates a tool input that is not the expected shape (no findings)', async () => {
    const { client } = fakeClient(() => ({ input: { nope: true } }));
    const r = await reviewDocument({ pdf, docType: 'form17', client, models });
    expect(r.findings).toEqual([]);
  });

  it('rejects non-PDF bytes and oversized documents', async () => {
    const { client } = fakeClient(() => ({ input: { findings: [] } }));
    await expect(reviewDocument({ pdf: new TextEncoder().encode('not a pdf'), docType: 'form17', client, models })).rejects.toMatchObject({ code: 'not_pdf' });
    await expect(
      reviewDocument({ pdf, docType: 'form17', client, models, readPages: async () => Array(301).fill('x') }),
    ).rejects.toMatchObject({ code: 'too_many_pages' });
  });

  it('guesses common document types from their first page', () => {
    expect(guessDocType('COMMITMENT FOR TITLE INSURANCE issued by')).toBe('title');
    expect(guessDocType('Home Inspection Report prepared for')).toBe('inspection');
    expect(guessDocType('DECLARATION OF COVENANTS, CONDITIONS')).toBe('hoa');
    expect(guessDocType('Something else')).toBeNull();
  });
});
