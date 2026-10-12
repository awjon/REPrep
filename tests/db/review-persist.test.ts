import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';
import { failRun, finishRun, latestRunWithFindings, startRun } from '@/lib/review/persist';
import type { ReviewResult } from '@/lib/review/pipeline';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const U = randomUUID();
const OTHER = randomUUID();
let documentId: string;

const result: ReviewResult = {
  docType: 'form17',
  promptVersion: 's1.form17.v1',
  findings: [
    { severity: 'low', category: 'Roof', summary: 'The roof was replaced in 2011 per the seller.', page: 3, quote: 'The roof was replaced in 2011', questionToAsk: 'Ask the seller for roofing invoices.', quoteVerified: true },
    { severity: 'high', category: 'Water intrusion', summary: 'Water came in along the north wall.', page: 1, quote: 'Water came in along the north wall', questionToAsk: 'Ask the seller about water since 2023.', quoteVerified: true },
  ],
  dropped: 2,
  dropReasons: { quote_not_on_page: 2 },
  pagesReviewed: 3,
  mostlyScanned: false,
  usage: { inputTokens: 12000, outputTokens: 900 },
  costUsd: 0.033,
};

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${U}, 'rev@test.local'), (${OTHER}, 'other@test.local')`;
  documentId = await withUser(db, U, async (tx) => {
    const [d] = await tx.insert(schema.deals).values({ address: '3 Review Rd' }).returning();
    const [doc] = await tx
      .insert(schema.documents)
      .values({ dealId: d!.id, storagePath: `${U}/${d!.id}/x.pdf`, filename: 'disclosure.pdf', sizeBytes: 1234 })
      .returning();
    return doc!.id;
  });
});
afterAll(async () => {
  await client`delete from auth.users where id in (${U}, ${OTHER})`;
  await client.end();
});

describe('review persistence', () => {
  it("another user cannot start a run on someone else's document", async () => {
    await expect(withUser(db, OTHER, (tx) => startRun(tx, documentId, 'claude-sonnet-5-5'))).rejects.toThrow(/not found/);
  });

  it('records a finished run, its findings, and updates the document', async () => {
    const runId = await withUser(db, U, (tx) => startRun(tx, documentId, 'claude-sonnet-5-5'));
    await expect(withUser(db, U, (tx) => startRun(tx, documentId, 'claude-sonnet-5-5'))).rejects.toThrow(/already running/);
    await withUser(db, U, (tx) => finishRun(tx, runId, documentId, result));

    const latest = await withUser(db, U, (tx) => latestRunWithFindings(tx, documentId));
    expect(latest!.run).toMatchObject({ status: 'done', promptVersion: 's1.form17.v1', inputTokens: 12000, outputTokens: 900, costUsd: '0.0330', findingsDropped: 2, pagesReviewed: 3 });
    expect(latest!.findings.map((f) => f.severity)).toEqual(['high', 'low']);
    const [doc] = await withUser(db, U, (tx) => tx.select().from(schema.documents).where(eq(schema.documents.id, documentId)));
    expect(doc).toMatchObject({ docType: 'form17', pageCount: 3, isScanned: false });

    expect(await withUser(db, OTHER, (tx) => latestRunWithFindings(tx, documentId))).toBeNull();
  });

  it('records a failed run with a short code only', async () => {
    const runId = await withUser(db, U, (tx) => startRun(tx, documentId, 'claude-sonnet-5-5'));
    await withUser(db, U, (tx) => failRun(tx, runId, 'unsupported_type', { inputTokens: 2000, outputTokens: 10 }));
    const latest = await withUser(db, U, (tx) => latestRunWithFindings(tx, documentId));
    expect(latest!.run).toMatchObject({ status: 'failed', error: 'unsupported_type', inputTokens: 2000 });
    expect(latest!.findings).toEqual([]);
  });

  it('deleting the document removes runs and findings (hard delete)', async () => {
    await withUser(db, U, (tx) => tx.delete(schema.documents).where(eq(schema.documents.id, documentId)));
    const [{ n }] = (await client`select count(*)::int as n from review_findings f join review_runs r on r.id = f.run_id where r.document_id = ${documentId}`) as unknown as [{ n: number }];
    expect(n).toBe(0);
  });
});
