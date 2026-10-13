import { describe, expect, it } from 'vitest';
import { findBanned } from '@/lib/legal/banned-phrases';
import { MAX_PDF_BYTES } from '@/lib/review/pdf';
import { docTypeLabel, formatUsd, reviewStatusLabel } from '@/lib/documents/display';
import { progressLabel, REVIEW_ERROR_MESSAGES, reviewErrorMessage } from '@/lib/documents/messages';
import { createLineParser, encodeLine } from '@/lib/documents/ndjson';
import { buildStoragePath, checkUpload, cleanFilename, DOC_TYPE_OPTIONS, MAX_UPLOAD_BYTES, pathBelongsTo } from '@/lib/documents/validation';

const U = '11111111-1111-4111-8111-111111111111';
const D = '22222222-2222-4222-8222-222222222222';
const O = '33333333-3333-4333-8333-333333333333';
const OBJ = '44444444-4444-4444-8444-444444444444';

describe('upload validation', () => {
  it('upload cap matches the review cap', () => expect(MAX_UPLOAD_BYTES).toBe(MAX_PDF_BYTES));
  it('accepts a normal pdf', () => expect(checkUpload({ filename: 'Form 17.PDF', sizeBytes: 1000 })).toEqual({ ok: true, filename: 'Form 17.PDF' }));
  it.each([
    ['not a pdf name', 'notes.docx', 1000],
    ['no name', '.pdf', 1000],
    ['empty', 'a.pdf', 0],
    ['NaN size', 'a.pdf', Number.NaN],
    ['too big', 'a.pdf', MAX_UPLOAD_BYTES + 1],
  ])('rejects %s', (_l, filename, sizeBytes) => expect(checkUpload({ filename, sizeBytes }).ok).toBe(false));
  it('accepts exactly the cap', () => expect(checkUpload({ filename: 'a.pdf', sizeBytes: MAX_UPLOAD_BYTES }).ok).toBe(true));
  it('strips directories and control characters', () => expect(cleanFilename('C:\\x\\..\\a\u0000b.pdf')).toBe('ab.pdf'));
  it('offers the five document choices', () =>
    expect(DOC_TYPE_OPTIONS.map((o) => o.value)).toEqual(['unknown', 'form17', 'inspection', 'title', 'hoa']));
});

describe('storage path', () => {
  const path = buildStoragePath(U, D, OBJ);
  it('has the documented shape', () => expect(path).toBe(`${U}/${D}/${OBJ}.pdf`));
  it('accepts own path', () => expect(pathBelongsTo(path, U, D)).toBe(true));
  it.each([
    ['other user', `${O}/${D}/${OBJ}.pdf`],
    ['other deal', `${U}/${O}/${OBJ}.pdf`],
    ['traversal', `${U}/${D}/../${O}/${OBJ}.pdf`],
    ['extra segment', `${U}/${D}/x/${OBJ}.pdf`],
    ['not uuid object', `${U}/${D}/evil.pdf`],
    ['wrong extension', `${U}/${D}/${OBJ}.exe`],
    ['trailing junk', `${U}/${D}/${OBJ}.pdf/`],
  ])('rejects %s', (_l, p) => expect(pathBelongsTo(p, U, D)).toBe(false));
});

describe('ndjson', () => {
  it('encodes one line per value', () => expect(encodeLine({ a: 1 })).toBe('{"a":1}\n'));
  it('parses across chunk boundaries and skips junk', () => {
    const p = createLineParser();
    expect(p.push('{"a":1}\n{"b"')).toEqual([{ a: 1 }]);
    expect(p.push(':2}\nnot json\n\n{"c":3}')).toEqual([{ b: 2 }]);
    expect(p.flush()).toEqual([{ c: 3 }]);
    expect(p.flush()).toEqual([]);
  });
});

describe('messages and labels', () => {
  const codes = ['not_pdf', 'too_many_pages', 'unsupported_type', 'model_error', 'encrypted'];
  it('covers every ReviewError code', () => codes.forEach((c) => expect(REVIEW_ERROR_MESSAGES[c]).toBeTruthy()));
  it('falls back for unknown codes', () => {
    expect(reviewErrorMessage('weird')).toBe(REVIEW_ERROR_MESSAGES.internal);
    expect(reviewErrorMessage(null)).toBe(REVIEW_ERROR_MESSAGES.internal);
  });
  it('passes the banned-phrase check', () => {
    const all = [
      ...Object.values(REVIEW_ERROR_MESSAGES),
      progressLabel({ stage: 'reading', pages: 3 }),
      progressLabel({ stage: 'reviewing', chunk: 1, of: 2 }),
      progressLabel({ stage: 'validating' }),
      progressLabel({ stage: 'classified', docType: 'form17' }),
    ];
    for (const m of all) expect(findBanned(m)).toEqual([]);
  });
  it('words progress as the spec says', () => {
    expect(progressLabel({ stage: 'reading', pages: 1 })).toBe('Reading 1 page');
    expect(progressLabel({ stage: 'reading', pages: 12 })).toBe('Reading 12 pages');
    expect(progressLabel({ stage: 'reviewing', chunk: 2, of: 3 })).toBe('Reviewing part 2 of 3');
    expect(progressLabel({ stage: 'validating' })).toBe('Checking citations');
  });
  it('display helpers', () => {
    expect(docTypeLabel('form17')).toBe('Seller disclosure statement');
    expect(docTypeLabel('unknown')).toBe('Not yet identified');
    expect(reviewStatusLabel(null, 0)).toBe('Not reviewed');
    expect(reviewStatusLabel({ status: 'running', error: null }, 0)).toBe('Review in progress');
    expect(reviewStatusLabel({ status: 'failed', error: 'x' }, 0)).toBe('Review did not complete');
    expect(reviewStatusLabel({ status: 'done', error: null }, 1)).toBe('1 finding');
    expect(formatUsd('0.0330')).toBe('$0.03');
  });
});
