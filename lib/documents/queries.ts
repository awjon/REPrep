// Read models for the documents pages. Callers pass an RLS-scoped tx.

import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { documents, reviewFindings, reviewRuns } from '@/lib/db/schema';

export async function listDocumentsWithStatus(tx: Tx, dealId: string) {
  const docs = await tx.select().from(documents).where(eq(documents.dealId, dealId)).orderBy(desc(documents.createdAt));
  if (docs.length === 0) return [];
  const ids = docs.map((d) => d.id);
  const runs = await tx.select().from(reviewRuns).where(inArray(reviewRuns.documentId, ids)).orderBy(desc(reviewRuns.startedAt));
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!latest.has(r.documentId)) latest.set(r.documentId, r);
  const counts = new Map<string, number>();
  const latestIds = [...latest.values()].map((r) => r.id);
  if (latestIds.length > 0) {
    const rows = await tx
      .select({ runId: reviewFindings.runId, n: sql<number>`count(*)::int` })
      .from(reviewFindings)
      .where(inArray(reviewFindings.runId, latestIds))
      .groupBy(reviewFindings.runId);
    for (const r of rows) counts.set(r.runId, r.n);
  }
  return docs.map((doc) => {
    const run = latest.get(doc.id) ?? null;
    return { doc, run, findingCount: run ? (counts.get(run.id) ?? 0) : 0 };
  });
}

export async function getDocument(tx: Tx, dealId: string, documentId: string) {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId));
  return doc && doc.dealId === dealId ? doc : null;
}
