// Pure checks for the upload flow. No I/O, so they run in unit tests and on the client.

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024; // keep equal to MAX_PDF_BYTES in lib/review/pdf.ts

export const DOC_TYPE_OPTIONS = [
  { value: 'unknown', label: 'Let REPrep detect' },
  { value: 'form17', label: 'Seller disclosure' },
  { value: 'inspection', label: 'Inspection report' },
  { value: 'title', label: 'Title commitment' },
  { value: 'hoa', label: 'HOA documents' },
] as const;

export type UploadDocType = (typeof DOC_TYPE_OPTIONS)[number]['value'];
export const UPLOAD_DOC_TYPES = DOC_TYPE_OPTIONS.map((o) => o.value) as [UploadDocType, ...UploadDocType[]];

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export type UploadCheck = { ok: true; filename: string } | { ok: false; error: string };

/** Strips any directory part and control characters; keeps the name short enough to display. */
export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop()!.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base.length > 120 ? `${base.slice(0, 116)}.pdf` : base;
}

export function checkUpload(input: { filename: string; sizeBytes: number }): UploadCheck {
  const filename = cleanFilename(input.filename);
  if (!/\.pdf$/i.test(filename) || filename.length < 5) return { ok: false, error: 'Choose a PDF file (the name should end in .pdf).' };
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, error: 'That file is empty.' };
  if (input.sizeBytes > MAX_UPLOAD_BYTES) return { ok: false, error: 'That file is larger than 30 MB.' };
  return { ok: true, filename };
}

export const buildStoragePath = (userId: string, dealId: string, objectId: string): string =>
  `${userId}/${dealId}/${objectId}.pdf`;

/** True only for exactly `${userId}/${dealId}/<uuid>.pdf` — no extra segments, no traversal. */
export function pathBelongsTo(path: string, userId: string, dealId: string): boolean {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${esc(userId)}/${esc(dealId)}/${UUID}\\.pdf$`, 'i').test(path);
}
