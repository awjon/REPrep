// Review run bookkeeping. All functions take an RLS-scoped tx (withUser), so a user can only
// start, finish, or read runs on their own documents.

import { and, desc, eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { documents, reviewFindings, reviewRuns } from '@/lib/db/schema';
import type { ReviewResult } from './pipeline';

export async function startRun(tx: Tx, documentId: string, model: string): Promise<string> {
  const [doc] = await tx.select({ id: documents.id }).from(documents).where(eq(documents.id, documentId));
  if (!doc) throw new Error('document not found');
  const running = await tx
    .select({ id: reviewRuns.id })
    .from(reviewRuns)
    .where(and(eq(reviewRuns.documentId, documentId), eq(reviewRuns.status, 'running')));
  if (running.length > 0) throw new Error('review already running');
  const [run] = await tx
    .insert(reviewRuns)
    .values({ documentId, model, promptVersion: 'pending', status: 'running' })
    .returning({ id: reviewRuns.id });
  return run!.id;
}

export async function finishRun(tx: Tx, runId: string, documentId: string, r: ReviewResult): Promise<void> {
  if (r.findings.length > 0) {
    await tx.insert(reviewFindings).values(
      r.findings.map((f) => ({
        runId,
        severity: f.severity,
        category: f.category,
        summary: f.summary,
        page: f.page,
        quote: f.quote,
        quoteVerified: f.quoteVerified,
        questionToAsk: f.questionToAsk,
      })),
    );
  }
  await tx
    .update(reviewRuns)
    .set({
      status: 'done',
      promptVersion: r.promptVersion,
      inputTokens: r.usage.inputTokens,
      outputTokens: r.usage.outputTokens,
      costUsd: r.costUsd.toFixed(4),
      findingsDropped: r.dropped,
      pagesReviewed: r.pagesReviewed,
      finishedAt: new Date(),
    })
    .where(eq(reviewRuns.id, runId));
  await tx
    .update(documents)
    .set({ docType: r.docType, pageCount: r.pagesReviewed, isScanned: r.mostlyScanned })
    .where(eq(documents.id, documentId));
}

/** `code` is a short machine string (ReviewError code or 'internal'); never document text. */
export async function failRun(tx: Tx, runId: string, code: string, usage?: { inputTokens: number; outputTokens: number }) {
  await tx
    .update(reviewRuns)
    .set({
      status: 'failed',
      error: code.slice(0, 40),
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      finishedAt: new Date(),
    })
    .where(eq(reviewRuns.id, runId));
}

export async function latestRunWithFindings(tx: Tx, documentId: string) {
  const [run] = await tx
    .select()
    .from(reviewRuns)
    .where(eq(reviewRuns.documentId, documentId))
    .orderBy(desc(reviewRuns.startedAt))
    .limit(1);
  if (!run) return null;
  const findings = await tx.select().from(reviewFindings).where(eq(reviewFindings.runId, run.id));
  const order = { high: 0, medium: 1, low: 2, info: 3 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.page - b.page);
  return { run, findings };
}
