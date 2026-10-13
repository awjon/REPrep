// Turns raw model output into findings we are willing to show. Pure.
// A finding is dropped unless: it parses, its page exists, its quote is found on that page
// (or the page has no text layer), and its wording passes the banned-phrase filter.

import { findBanned } from '@/lib/legal/banned-phrases';
import { modelFinding, type DropReason, type ValidatedFinding } from './schema';

/** Lowercase alphanumeric tokens, so line breaks, hyphenation, quote styles and spacing don't matter. */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2') // re-join words hyphenated across lines
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Minimum evidence for a citation: a short generic phrase ("the seller") proves nothing. */
export const MIN_QUOTE_WORDS = 4;
export const MIN_QUOTE_CHARS = 20;

/** True when the quote is one continuous passage of the page text (after normalization). */
export function quoteOnPage(quote: string, pageText: string): boolean {
  if (/\.\.\.|…/.test(quote)) return false; // stitched fragments are not a citation
  const q = normalizeForMatch(quote);
  if (q.length < MIN_QUOTE_CHARS || q.split(' ').length < MIN_QUOTE_WORDS) return false;
  return normalizeForMatch(pageText).includes(q);
}

export type ChunkResult = {
  /** Raw findings as returned by the model for this chunk. */
  raw: unknown[];
  /** Absolute page number of this chunk's first page, minus one. */
  pageOffset: number;
  /** Number of pages in this chunk. */
  pageCount: number;
};

export type ValidationResult = {
  kept: ValidatedFinding[];
  dropped: { reason: DropReason; page?: number }[];
};

/**
 * @param pageTexts extracted text per absolute page (index 0 = page 1). An empty string means
 *   the page has no text layer (scanned); quotes on such pages are kept but marked unverified.
 */
export function validateFindings(chunks: ChunkResult[], pageTexts: string[]): ValidationResult {
  const kept: ValidatedFinding[] = [];
  const dropped: ValidationResult['dropped'] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    for (const raw of chunk.raw) {
      const parsed = modelFinding.safeParse(raw);
      if (!parsed.success) {
        dropped.push({ reason: 'malformed' });
        continue;
      }
      const f = parsed.data;
      if (f.page > chunk.pageCount) {
        dropped.push({ reason: 'page_out_of_range', page: f.page });
        continue;
      }
      const page = chunk.pageOffset + f.page;
      const text = pageTexts[page - 1] ?? '';
      const scanned = text.trim().length === 0;
      if (!scanned && !quoteOnPage(f.quote, text)) {
        dropped.push({ reason: 'quote_not_on_page', page });
        continue;
      }
      if (findBanned(`${f.summary}\n${f.question_to_ask}\n${f.category}`).length > 0) {
        dropped.push({ reason: 'advice_language', page });
        continue;
      }
      const key = `${page}|${normalizeForMatch(f.quote)}`;
      if (seen.has(key)) {
        dropped.push({ reason: 'duplicate', page });
        continue;
      }
      seen.add(key);
      kept.push({
        severity: f.severity,
        category: f.category,
        summary: f.summary,
        page,
        quote: f.quote,
        questionToAsk: f.question_to_ask,
        quoteVerified: !scanned,
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
  kept.sort((a, b) => order[a.severity] - order[b.severity] || a.page - b.page);
  return { kept, dropped };
}
