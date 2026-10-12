import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearExactDate, setExactDate, syncDealDates } from '@/lib/deals/schedule';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const U = randomUUID();
let dealId: string;

const rows = () =>
  withUser(db, U, (tx) =>
    tx.select().from(schema.dealDates).where(eq(schema.dealDates.dealId, dealId)).orderBy(schema.dealDates.dueAt),
  );
const byKind = async () => Object.fromEntries((await rows()).map((r) => [r.kind, r]));
const update = (values: Partial<typeof schema.deals.$inferInsert>) =>
  withUser(db, U, async (tx) => {
    await tx.update(schema.deals).set(values).where(eq(schema.deals.id, dealId));
    await syncDealDates(tx, dealId);
  });

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${U}, 'sync@test.local')`;
  const [d] = await withUser(db, U, (tx) => tx.insert(schema.deals).values({ address: '2 Test St' }).returning());
  dealId = d!.id;
});
afterAll(async () => {
  await client`delete from auth.users where id = ${U}`;
  await client.end();
});

describe('syncDealDates', () => {
  it('creates nothing until mutual acceptance is set', async () => {
    await withUser(db, U, (tx) => syncDealDates(tx, dealId));
    expect(await rows()).toHaveLength(0);
  });

  it('creates the default schedule from acceptance', async () => {
    await update({ mutualAcceptanceAt: new Date('2026-10-10T06:30:00Z') });
    const k = await byKind();
    expect(Object.keys(k).sort()).toEqual(['earnest_money', 'financing', 'form17_review', 'inspection']);
    expect(k.inspection!.dueAt.toISOString()).toBe('2026-10-20T04:00:00.000Z'); // Mon Oct 19, 9pm PDT
    expect(k.inspection!.periodDays).toBe(10);
  });

  it('adds closing + possession and keeps completion state across re-syncs', async () => {
    await withUser(db, U, (tx) =>
      tx
        .update(schema.dealDates)
        .set({ completedAt: new Date() })
        .where(and(eq(schema.dealDates.dealId, dealId), eq(schema.dealDates.kind, 'earnest_money'))),
    );
    await update({ closingDate: '2026-11-26' });
    const k = await byKind();
    expect(k.closing!.dueAt.toISOString()).toBe('2026-12-01T05:00:00.000Z'); // rolled to Mon Nov 30
    expect(k.possession).toBeDefined();
    expect(k.earnest_money!.completedAt).not.toBeNull();
  });

  it('an exact date set by the user survives later changes to the inputs', async () => {
    const insp = (await byKind()).inspection!;
    await withUser(db, U, (tx) => setExactDate(tx, insp.id, '2026-10-23'));
    await update({ mutualAcceptanceAt: new Date('2026-10-13T18:00:00Z') });
    const k = await byKind();
    expect(k.inspection!.isOverridden).toBe(true);
    expect(k.inspection!.dueAt.toISOString()).toBe('2026-10-24T04:00:00.000Z');
    expect(k.financing!.dueAt.toISOString()).toBe('2026-11-04T05:00:00.000Z'); // Oct 13 + 21 = Nov 3, 9pm PST
  });

  it('clearing the exact date returns the row to the computed value', async () => {
    const insp = (await byKind()).inspection!;
    await withUser(db, U, async (tx) => {
      await clearExactDate(tx, insp.id);
      await syncDealDates(tx, dealId);
    });
    const k = await byKind();
    expect(k.inspection!.isOverridden).toBe(false);
    expect(k.inspection!.dueAt.toISOString()).toBe('2026-10-24T04:00:00.000Z'); // Oct 13 + 10 = Fri Oct 23
  });

  it('removing a contingency deletes its row; removing closing deletes closing and possession', async () => {
    await update({ periodOverrides: { financing: null }, closingDate: null });
    const k = await byKind();
    expect(k.financing).toBeUndefined();
    expect(k.closing).toBeUndefined();
    expect(k.possession).toBeUndefined();
    expect(k.inspection).toBeDefined();
  });

  it('leaves custom rows alone', async () => {
    await withUser(db, U, (tx) =>
      tx.insert(schema.dealDates).values({ dealId, kind: 'custom', label: 'Walkthrough', dueAt: new Date('2026-11-01T17:00:00Z') }),
    );
    await update({ mutualAcceptanceAt: null });
    const left = await rows();
    expect(left.map((r) => r.kind)).toEqual(['custom']);
  });

  it("refuses to sync a deal the user can't see", async () => {
    const other = randomUUID();
    await client`insert into auth.users (id) values (${other})`;
    await expect(withUser(db, other, (tx) => syncDealDates(tx, dealId))).rejects.toThrow(/not found/);
    await client`delete from auth.users where id = ${other}`;
  });
});
