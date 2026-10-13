import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser as withUserOn, type Db, type Tx } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';
import { beginReview, executeReview, type ReviewDeps, type StreamLine } from '@/lib/documents/run-review';
import { latestRunWithFindings } from '@/lib/review/persist';
import { reviewDocument, ReviewError, type MessagesClient } from '@/lib/review/pipeline';
import { makePdf, SAMPLE_DISCLOSURE } from '@/tests/fixtures/pdf';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const withUser = <T>(uid: string, fn: (tx: Tx) => Promise<T>) => withUserOn(db, uid, fn);
const U = randomUUID();
const OTHER = randomUUID();
let docId: string;
let pdf: Uint8Array;

const fakeClient = (): MessagesClient => ({
  messages: {
    async create() {
      return {
        content: [
          {
            type: 'tool_use',
            name: 'record_findings',
            input: {
              findings: [
                {
                  severity: 'high',
                  category: 'Water intrusion',
                  summary: 'The seller reports water came in along the north wall during heavy rain.',
                  page: 1,
                  quote: 'Water came in along the north wall during heavy rain in 2023',
                  question_to_ask: 'Ask the seller whether water has entered since the sump pump was installed.',
                },
                {
                  severity: 'low',
                  category: 'Made up',
                  summary: 'This quote is not anywhere in the document at all.',
                  page: 1,
                  quote: 'a sentence that does not appear anywhere',
                  question_to_ask: 'Ask the seller about something that is not there.',
                },
              ],
            },
          },
        ],
        usage: { input_tokens: 1000, output_tokens: 100 },
      };
    },
  },
});

const deps = (over: Partial<ReviewDeps> = {}): ReviewDeps => ({
  withUser,
  downloadPdf: async () => pdf,
  model: 'test-model',
  review: (o) => reviewDocument({ ...o, client: fakeClient(), models: { review: 'test-model', triage: 'test-triage' } }),
  ...over,
});

beforeAll(async () => {
  pdf = await makePdf(SAMPLE_DISCLOSURE);
  await client`insert into auth.users (id, email) values (${U}, 'run@test.local'), (${OTHER}, 'run2@test.local')`;
  docId = await withUser(U, async (tx) => {
    const [d] = await tx.insert(schema.deals).values({ address: '9 Run Rd' }).returning();
    const [doc] = await tx
      .insert(schema.documents)
      .values({ dealId: d!.id, storagePath: `${U}/${d!.id}/${randomUUID()}.pdf`, filename: 'd.pdf', sizeBytes: pdf.length, docType: 'form17' })
      .returning();
    return doc!.id;
  });
});
afterAll(async () => {
  await client`delete from auth.users where id in (${U}, ${OTHER})`;
  await client.end();
});

const runAll = async (d: ReviewDeps, uid = U) => {
  const begun = await beginReview(d, uid, docId);
  if (begun.kind !== 'started') throw new Error(`expected started, got ${begun.kind}`);
  const lines: StreamLine[] = [];
  await executeReview(d, uid, docId, begun, (l) => lines.push(l));
  return { begun, lines };
};

describe('review orchestration', () => {
  it('another user gets not_found', async () => {
    expect((await beginReview(deps(), OTHER, docId)).kind).toBe('not_found');
    expect((await beginReview(deps(), U, randomUUID())).kind).toBe('not_found');
  });

  it('happy path: progress lines, then done; findings persisted; uncited finding dropped', async () => {
    const { begun, lines } = await runAll(deps());
    const last = lines.at(-1)!;
    expect(last).toEqual({ done: true, runId: begun.runId, findings: 1, dropped: 1 });
    expect(lines.slice(0, -1).map((l) => ('stage' in l ? l.stage : 'x'))).toEqual(['reading', 'classified', 'reviewing', 'validating']);
    const latest = await withUser(U, (tx) => latestRunWithFindings(tx, docId));
    expect(latest!.run.status).toBe('done');
    expect(latest!.run.findingsDropped).toBe(1);
    expect(latest!.findings).toHaveLength(1);
  });

  it('second begin while one is running returns running', async () => {
    const first = await beginReview(deps(), U, docId);
    expect(first.kind).toBe('started');
    expect((await beginReview(deps(), U, docId)).kind).toBe('running');
    if (first.kind === 'started') await executeReview(deps(), U, docId, first, () => {});
  });

  it('ReviewError ends in its code and fails the run', async () => {
    const { lines, begun } = await runAll(deps({ review: async () => { throw new ReviewError('encrypted', 'x'); } }));
    expect(lines).toEqual([{ error: 'encrypted' }]);
    const [run] = await withUser(U, (tx) => tx.select().from(schema.reviewRuns).where(eq(schema.reviewRuns.id, begun.runId)));
    expect(run).toMatchObject({ status: 'failed', error: 'encrypted' });
  });

  it('unexpected errors (including download failure) end in internal', async () => {
    const { lines, begun } = await runAll(deps({ downloadPdf: async () => { throw new Error('boom'); } }));
    expect(lines).toEqual([{ error: 'internal' }]);
    const [run] = await withUser(U, (tx) => tx.select().from(schema.reviewRuns).where(eq(schema.reviewRuns.id, begun.runId)));
    expect(run).toMatchObject({ status: 'failed', error: 'internal' });
  });

  it('keeps running to completion when the client stops reading', async () => {
    const begun = await beginReview(deps(), U, docId);
    if (begun.kind !== 'started') throw new Error('expected started');
    await executeReview(deps(), U, docId, begun, () => { throw new Error('stream closed'); });
    const [run] = await withUser(U, (tx) => tx.select().from(schema.reviewRuns).where(eq(schema.reviewRuns.id, begun.runId)));
    expect(run!.status).toBe('done');
  });
});
