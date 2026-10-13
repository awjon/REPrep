import { extractText, getDocumentProxy } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER_TEXT } from '@/lib/legal/disclaimer';
import { findBanned } from '@/lib/legal/banned-phrases';
import { renderTermSheetPdf, shortAddress, TERM_SHEET_SUBTITLE } from '@/lib/term-sheet/pdf';
import { termSheetDefaults } from '@/lib/term-sheet/defaults';
import { parseTermSheetForm, dataToForm, type TermSheetData } from '@/lib/term-sheet/schema';

function sample(over: Record<string, string> = {}): TermSheetData {
  const base = termSheetDefaults({
    address: '123 Alki Ave SW, Seattle',
    parcelPin: '9800000001',
    closingDate: '2026-12-15',
    possessionDaysAfterClosing: 3,
    periodOverrides: {},
  });
  const r = parseTermSheetForm({
    ...dataToForm(base),
    price: '850000',
    earnestMoney: '20000',
    downPaymentPct: '20',
    itemsIncluded: 'Refrigerator\nWasher and dryer',
    itemsExcluded: 'Dining room chandelier',
    questions: 'What does the title commitment list as exceptions?\nWho pays for the survey?',
    notes: 'Short note.',
    ...over,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.data;
}

async function read(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  return { pages: text as string[], totalPages };
}
const squash = (s: string) => s.replace(/\s+/g, ' ');

describe('renderTermSheetPdf', () => {
  it('produces a PDF with the title, subtitle, every section heading and the disclaimer on each page', async () => {
    const bytes = await renderTermSheetPdf(sample());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const { pages, totalPages } = await read(bytes);
    const all = squash(pages.join(' '));
    expect(all).toContain('Term sheet');
    expect(all).toContain('Not a contract.');
    expect(all).toContain(squash(TERM_SHEET_SUBTITLE).replace('\u2014', '-')); // text extraction normalizes the em dash
    for (const h of [
      'Property',
      'Price and earnest money',
      'Financing',
      'Contingencies',
      'Dates',
      'Included and excluded items',
      'Notes and questions for the attorney',
    ]) {
      expect(all).toContain(h);
    }
    expect(all).toContain('$850,000');
    expect(all).toContain('Dec 15, 2026');
    expect(all).toContain('3 days after closing');
    for (const p of pages) expect(squash(p)).toContain(squash(DISCLAIMER_TEXT['term-sheet']));
    expect(totalPages).toBe(pages.length);
  });

  it('adds pages for long notes and keeps the footer on all of them', async () => {
    const short = await read(await renderTermSheetPdf(sample()));
    const longNotes = Array.from({ length: 120 }, (_, i) => `Discussion point about the property, item ${i}.`).join('\n');
    const long = await read(await renderTermSheetPdf(sample({ notes: longNotes.slice(0, 4999) })));
    expect(long.totalPages).toBeGreaterThan(short.totalPages);
    expect(long.totalPages).toBeGreaterThanOrEqual(2);
    for (const p of long.pages) expect(squash(p)).toContain('It is not a contract and not legal advice.');
  });

  it('has no paragraph numbering, signature lines or agreement language', async () => {
    const { pages } = await read(await renderTermSheetPdf(sample()));
    for (const p of pages) {
      expect(p).not.toMatch(/^\s*\d+[a-z]?\.\s/m);
      expect(p).not.toMatch(/\b(signature|signed|buyer agrees|seller agrees|hereby|NWMLS|Form \d+)/i);
    }
    expect(squash(pages.join(' '))).not.toMatch(/_{3,}/);
  });

  it('wraps long unbroken text and survives characters outside the standard font', async () => {
    const data = sample({ notes: `${'x'.repeat(400)} café — 日本語 “quoted”` });
    const { pages } = await read(await renderTermSheetPdf(data));
    expect(squash(pages.join(' '))).toContain('café');
  });

  it('shows cash financing without a down payment and escalation details when on', async () => {
    const { pages } = await read(
      await renderTermSheetPdf(
        sample({ financingType: 'cash', escalation_enabled: 'on', escalation_increment: '5000', escalation_cap: '900000' }),
      ),
    );
    const all = squash(pages.join(' '));
    expect(all).toContain('Cash');
    expect(all).not.toContain('Down payment');
    expect(all).toContain('Increment $5,000, cap $900,000');
  });

  it('PDF copy constants pass the banned-phrase lint', () => {
    expect(findBanned(TERM_SHEET_SUBTITLE)).toEqual([]);
  });
});

describe('shortAddress', () => {
  it('makes a safe file name part', () => {
    expect(shortAddress('123 Alki Ave SW, Seattle')).toBe('123-alki-ave-sw-seattle');
    expect(shortAddress('"><script>/../x')).toBe('script-x');
    expect(shortAddress('日本語')).toBe('property');
    expect(shortAddress('a'.repeat(100)).length).toBeLessThanOrEqual(40);
  });
});
