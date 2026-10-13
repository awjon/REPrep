// Plain-language text for review progress and failures. Safe to import from client components.

export const REVIEW_ERROR_MESSAGES: Record<string, string> = {
  not_pdf: 'REPrep could not read this file as a PDF.',
  too_many_pages: 'This document is longer than REPrep can read in one run.',
  unsupported_type:
    'This does not look like a document type REPrep reviews. Pick the type yourself above if it was detected wrongly.',
  encrypted: 'This PDF is password-protected or damaged, so it could not be opened.',
  model_error: 'The automated reading did not complete. Try again in a few minutes.',
  internal: 'Something went wrong on our side. Try again in a few minutes.',
  timeout: 'The last review did not finish in time. Start it again.',
  already_running: 'A review of this document is already in progress.',
  not_found: 'This document could not be found.',
  unauthorized: 'Your session has ended. Sign in again to continue.',
};

export const reviewErrorMessage = (code: string | null | undefined): string =>
  REVIEW_ERROR_MESSAGES[code ?? ''] ?? REVIEW_ERROR_MESSAGES.internal!;

export type ProgressEvent =
  | { stage: 'reading'; pages: number }
  | { stage: 'classified'; docType: string }
  | { stage: 'reviewing'; chunk: number; of: number }
  | { stage: 'validating' };

export function progressLabel(p: ProgressEvent): string {
  switch (p.stage) {
    case 'reading':
      return `Reading ${p.pages} ${p.pages === 1 ? 'page' : 'pages'}`;
    case 'classified':
      return 'Identified the document type';
    case 'reviewing':
      return `Reviewing part ${p.chunk} of ${p.of}`;
    case 'validating':
      return 'Checking citations';
  }
}
