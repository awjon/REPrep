// Orchestrates one review run with injected dependencies, so it can be tested against the real
// local database without Supabase Storage or Anthropic. Each DB write is its own transaction:
// nothing is held open across the model call. Never logs or emits document text — counts and
// codes only.

import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { documents } from '@/lib/db/schema';
import { failRun, finishRun, startRun } from '@/lib/review/persist';
import { ReviewError, type ReviewProgress, type ReviewResult } from '@/lib/review/pipeline';
import type { ReviewDocType } from '@/lib/review/schema';

export type ReviewDeps = {
  withUser: <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  downloadPdf: (path: string) => Promise<Uint8Array>;
  review: (opts: {
    pdf: Uint8Array;
    docType: ReviewDocType | 'unknown';
    onProgress: (p: ReviewProgress) => void;
  }) => Promise<ReviewResult>;
  model: string;
};

export type StreamLine =
  | ReviewProgress
  | { done: true; runId: string; findings: number; dropped: number }
  | { error: string };

export type Begun =
  | { kind: 'not_found' }
  | { kind: 'running' }
  | { kind: 'started'; runId: string; storagePath: string; docType: ReviewDocType | 'unknown' };

/** Loads the document (RLS: invisible means not found) and opens a `running` review run. */
export async function beginReview(deps: ReviewDeps, userId: string, documentId: string): Promise<Begun> {
  return deps.withUser(userId, async (tx): Promise<Begun> => {
    const [doc] = await tx
      .select({ storagePath: documents.storagePath, docType: documents.docType })
      .from(documents)
      .where(eq(documents.id, documentId));
    if (!doc) return { kind: 'not_found' };
    try {
      const runId = await startRun(tx, documentId, deps.model);
      return {
        kind: 'started',
        runId,
        storagePath: doc.storagePath,
        docType: doc.docType === 'other' ? 'unknown' : doc.docType,
      };
    } catch (e) {
      if (e instanceof Error && e.message === 'review already running') return { kind: 'running' };
      throw e;
    }
  });
}

/** Runs the review for a started run and records the outcome. Never throws. */
export async function executeReview(
  deps: ReviewDeps,
  userId: string,
  documentId: string,
  started: Extract<Begun, { kind: 'started' }>,
  emit: (line: StreamLine) => void,
): Promise<void> {
  // A closed connection must not abort the run: emitting is best effort.
  const safeEmit = (line: StreamLine) => {
    try {
      emit(line);
    } catch {
      /* client went away */
    }
  };
  try {
    const pdf = await deps.downloadPdf(started.storagePath);
    const result = await deps.review({ pdf, docType: started.docType, onProgress: safeEmit });
    await deps.withUser(userId, (tx) => finishRun(tx, started.runId, documentId, result));
    safeEmit({ done: true, runId: started.runId, findings: result.findings.length, dropped: result.dropped });
  } catch (e) {
    const code = e instanceof ReviewError ? e.code : 'internal';
    try {
      await deps.withUser(userId, (tx) => failRun(tx, started.runId, code));
    } catch {
      /* the run stays `running`; nothing more to do here */
    }
    safeEmit({ error: code });
  }
}
