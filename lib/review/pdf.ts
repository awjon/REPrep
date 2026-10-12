// PDF utilities for review: per-page text (for quote verification and classification) and
// splitting into chunks under the API's per-request page limit.

import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_PAGES_PER_REQUEST = 50; // API allows 100 at standard context; 50 keeps requests small
export const MAX_PDF_BYTES = 30 * 1024 * 1024; // API request cap is 32 MB including the prompt
export const MAX_TOTAL_PAGES = 300;

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

export async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return text;
}

/** A page with fewer than this many letters is treated as having no usable text layer. */
const MIN_TEXT_CHARS = 25;

export function scannedPages(texts: string[]): boolean[] {
  return texts.map((t) => (t.match(/[a-z]/gi)?.length ?? 0) < MIN_TEXT_CHARS);
}

/** Mostly-image documents: more than half the pages lack a text layer. */
export function isMostlyScanned(texts: string[]): boolean {
  const s = scannedPages(texts);
  return s.length > 0 && s.filter(Boolean).length / s.length > 0.5;
}

export type PdfChunk = { bytes: Uint8Array; pageOffset: number; pageCount: number };

export async function splitPdf(bytes: Uint8Array, maxPages = MAX_PAGES_PER_REQUEST): Promise<PdfChunk[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const total = src.getPageCount();
  if (total <= maxPages) return [{ bytes, pageOffset: 0, pageCount: total }];
  const chunks: PdfChunk[] = [];
  for (let start = 0; start < total; start += maxPages) {
    const out = await PDFDocument.create();
    const indices = Array.from({ length: Math.min(maxPages, total - start) }, (_, i) => start + i);
    for (const p of await out.copyPages(src, indices)) out.addPage(p);
    chunks.push({ bytes: await out.save(), pageOffset: start, pageCount: indices.length });
  }
  return chunks;
}
