import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser as withUserOn, type Db, type Tx } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';
import { listDocumentsWithStatus } from '@/lib/documents/queries';
import { deleteDocument, finalizeDocument, type ServiceDeps } from '@/lib/documents/service';
import { buildStoragePath, MAX_UPLOAD_BYTES } from '@/lib/documents/validation';
import { failRun, finishRun, startRun } from '@/lib/review/persist';
import { makePdf } from '@/tests/fixtures/pdf';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const withUser = <T>(uid: string, fn: (tx: Tx) => Promise<T>) => withUserOn(db, uid, fn);
const A = randomUUID();
const B = randomUUID();
let dealA: string;
let pdf: Uint8Array;

// Fake bucket: path -> bytes.
let store: Map<string, Uint8Array>;
let removeFails = false;
const mk = (): ServiceDeps => ({
  withUser,
  storage: {
    objectSize: async (p) => store.get(p)?.length ?? null,
    downloadPdf: async (p) => {
      const b = store.get(p);
      if (!b) throw new Error('missing');
      return b;
    },
    removeObject: async (p) => {
      if (removeFails) throw new Error('remove failed');
      store.delete(p);
    },
  },
});
const put = (path: string, bytes: Uint8Array) => store.set(path, bytes);

beforeAll(async () => {
  pdf = await makePdf(['hello page']);
  await client`insert into auth.users (id, email) values (${A}, 'svc-a@test.local'), (${B}, 'svc-b@test.local')`;
  dealA = await withUser(A, async (tx) => (await tx.insert(schema.deals).values({ address: '1 Svc St' }).returning())[0]!.id);
});
afterAll(async () => {
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});

describe('finalizeDocument', () => {
  it('records a document for a valid upload, using the real object size', async () => {
    store = new Map();
    const path = buildStoragePath(A, dealA, randomUUID());
    put(path, pdf);
    const r = await finalizeDocument(mk(), A, dealA, { path, filename: 'C:\\x\\Form 17.pdf', docType: 'form17' });
    expect(r.ok).toBe(true);
    const [doc] = await withUser(A, (tx) => tx.select().from(schema.documents).where(eq(schema.documents.storagePath, path)));
    expect(doc).toMatchObject({ filename: 'Form 17.pdf', docType: 'form17', sizeBytes: pdf.length, dealId: dealA });
  });

  it('removes an object that is not a PDF', async () => {
    store = new Map();
    const path = buildStoragePath(A, dealA, randomUUID());
    put(path, new TextEncoder().encode('MZ not a pdf at all'));
    const r = await finalizeDocument(mk(), A, dealA, { path, filename: 'a.pdf', docType: 'unknown' });
    expect(r.ok).toBe(false);
    expect(store.has(path)).toBe(false);
  });

  it('removes an oversize object', async () => {
    store = new Map();
    const path = buildStoragePath(A, dealA, randomUUID());
    put(path, pdf);
    const d = mk();
    d.storage.objectSize = async () => MAX_UPLOAD_BYTES + 1;
    expect((await finalizeDocument(d, A, dealA, { path, filename: 'a.pdf', docType: 'unknown' })).ok).toBe(false);
    expect(store.has(path)).toBe(false);
  });

  it('reports a missing object without inserting', async () => {
    store = new Map();
    const path = buildStoragePath(A, dealA, randomUUID());
    expect((await finalizeDocument(mk(), A, dealA, { path, filename: 'a.pdf', docType: 'unknown' })).ok).toBe(false);
    expect(await withUser(A, (tx) => tx.select().from(schema.documents).where(eq(schema.documents.storagePath, path)))).toHaveLength(0);
  });

  it("another user cannot finalize someone else's path (object untouched)", async () => {
    store = new Map();
    const path = buildStoragePath(A, dealA, randomUUID());
    put(path, pdf);
    const r = await finalizeDocument(mk(), B, dealA, { path, filename: 'a.pdf', docType: 'unknown' });
    expect(r.ok).toBe(false);
    expect(store.has(path)).toBe(true);
    expect((await client`select 1 from documents where storage_path = ${path}`).length).toBe(0);
  });

  it("another user cannot finalize into someone else's deal, even under their own prefix", async () => {
    store = new Map();
    const path = buildStoragePath(B, dealA, randomUUID());
    put(path, pdf);
    const r = await finalizeDocument(mk(), B, dealA, { path, filename: 'a.pdf', docType: 'unknown' });
    expect(r.ok).toBe(false);
    expect(store.has(path)).toBe(false); // their own orphan upload is cleaned up
    expect((await client`select 1 from documents where storage_path = ${path}`).length).toBe(0);
  });
});

describe('deleteDocument', () => {
  const seed = async () => {
    store = new Map();
    const path = buildStoragePath(A, dealA, randomUUID());
    put(path, pdf);
    const r = await finalizeDocument(mk(), A, dealA, { path, filename: 'del.pdf', docType: 'form17' });
    if (!r.ok) throw new Error('seed failed');
    return { path, documentId: r.documentId };
  };

  it('removes the object, the row, and cascades runs and findings', async () => {
    const { path, documentId } = await seed();
    const runId = await withUser(A, (tx) => startRun(tx, documentId, 'm'));
    await withUser(A, (tx) =>
      finishRun(tx, runId, documentId, {
        docType: 'form17', promptVersion: 'p', dropped: 0, dropReasons: {}, pagesReviewed: 1, mostlyScanned: false,
        usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0.01,
        findings: [{ severity: 'low', category: 'Roof', summary: 'The roof was replaced in 2011.', page: 1, quote: 'roof replaced 2011', questionToAsk: 'Ask for invoices.', quoteVerified: true }],
      }),
    );
    expect(await deleteDocument(mk(), A, documentId)).toBe(true);
    expect(store.has(path)).toBe(false);
    expect((await client`select 1 from documents where id = ${documentId}`).length).toBe(0);
    expect((await client`select 1 from review_runs where document_id = ${documentId}`).length).toBe(0);
    expect((await client`select 1 from review_findings where run_id = ${runId}`).length).toBe(0);
  });

  it("another user cannot delete someone else's document or object", async () => {
    const { path, documentId } = await seed();
    expect(await deleteDocument(mk(), B, documentId)).toBe(false);
    expect(store.has(path)).toBe(true);
    expect((await client`select 1 from documents where id = ${documentId}`).length).toBe(1);
  });

  it('keeps the row when the object cannot be removed, so delete can be retried', async () => {
    const { documentId } = await seed();
    removeFails = true;
    await expect(deleteDocument(mk(), A, documentId)).rejects.toThrow();
    removeFails = false;
    expect((await client`select 1 from documents where id = ${documentId}`).length).toBe(1);
    expect(await deleteDocument(mk(), A, documentId)).toBe(true);
  });
});

describe('listDocumentsWithStatus', () => {
  it('returns latest run status and finding count per document', async () => {
    store = new Map();
    const dealId = await withUser(A, async (tx) => (await tx.insert(schema.deals).values({ address: '2 List St' }).returning())[0]!.id);
    const path = buildStoragePath(A, dealId, randomUUID());
    put(path, pdf);
    const r = await finalizeDocument(mk(), A, dealId, { path, filename: 'l.pdf', docType: 'inspection' });
    if (!r.ok) throw new Error('seed failed');
    let rows = await withUser(A, (tx) => listDocumentsWithStatus(tx, dealId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ run: null, findingCount: 0 });
    const runId = await withUser(A, (tx) => startRun(tx, r.documentId, 'm'));
    await withUser(A, (tx) => failRun(tx, runId, 'model_error'));
    rows = await withUser(A, (tx) => listDocumentsWithStatus(tx, dealId));
    expect(rows[0]!.run).toMatchObject({ status: 'failed', error: 'model_error' });
    expect(await withUser(B, (tx) => listDocumentsWithStatus(tx, dealId))).toEqual([]);
  });
});
