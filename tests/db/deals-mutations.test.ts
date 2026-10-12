import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCustomDeadline,
  createDeal,
  deleteCustomDeadline,
  deleteDeal,
  pinDealDate,
  restoreComputedDate,
  saveScheduleInputs,
  setDealDateDone,
  updateDeal,
} from '@/lib/deals/mutations';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const A = randomUUID();
const B = randomUUID();
let dealId: string;

const dates = (user = A) =>
  withUser(db, user, (tx) =>
    tx.select().from(schema.dealDates).where(eq(schema.dealDates.dealId, dealId)).orderBy(schema.dealDates.dueAt),
  );
const deal = async (user = A) =>
  (await withUser(db, user, (tx) => tx.select().from(schema.deals).where(eq(schema.deals.id, dealId))))[0];

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${A}, 'a-deals@test.local'), (${B}, 'b-deals@test.local')`;
});
afterAll(async () => {
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});

describe('deal CRUD', () => {
  it('creates a deal owned by the caller', async () => {
    const id = await withUser(db, A, (tx) =>
      createDeal(tx, { address: ' 1 Alki Ave SW ', parcelPin: '1234567890', listPrice: '$900,000', notes: 'corner lot' }),
    );
    dealId = id;
    const d = (await deal())!;
    expect(d).toMatchObject({
      address: '1 Alki Ave SW',
      parcelPin: '1234567890',
      listPrice: 900000,
      notes: 'corner lot',
      status: 'watching',
      userId: A,
    });
  });

  it('rejects invalid input before touching the database', async () => {
    await expect(withUser(db, A, (tx) => createDeal(tx, { address: '' }))).rejects.toThrow();
    await expect(withUser(db, A, (tx) => createDeal(tx, { address: 'x', parcelPin: '12' }))).rejects.toThrow();
  });

  it('updates fields and status', async () => {
    await withUser(db, A, (tx) =>
      updateDeal(tx, dealId, { address: '1 Alki Ave SW', parcelPin: '', listPrice: '875000', notes: '', status: 'offer_prep' }),
    );
    const d = (await deal())!;
    expect(d).toMatchObject({ parcelPin: null, listPrice: 875000, notes: null, status: 'offer_prep' });
  });

  it("user B cannot see, update or delete user A's deal", async () => {
    expect(await deal(B)).toBeUndefined();
    await expect(
      withUser(db, B, (tx) => updateDeal(tx, dealId, { address: 'hijacked', status: 'closed' })),
    ).rejects.toThrow(/not found/);
    await expect(withUser(db, B, (tx) => deleteDeal(tx, dealId))).rejects.toThrow(/not found/);
    expect((await deal())!.address).toBe('1 Alki Ave SW');
  });
});

describe('schedule inputs', () => {
  it('saving inputs materializes the schedule', async () => {
    await withUser(db, A, (tx) =>
      saveScheduleInputs(tx, dealId, {
        acceptanceAt: '2026-10-09T23:30',
        form17ReceivedOn: '',
        closingDate: '2026-11-26',
        possessionDays: '2',
        period_inspection: '14',
        none_financing: 'on',
      }),
    );
    const d = (await deal())!;
    expect(d.mutualAcceptanceAt!.toISOString()).toBe('2026-10-10T06:30:00.000Z');
    expect(d.possessionDaysAfterClosing).toBe(2);
    expect(d.periodOverrides).toEqual({ inspection: 14, financing: null });
    const kinds = (await dates()).map((r) => r.kind).sort();
    expect(kinds).toEqual(['closing', 'earnest_money', 'form17_review', 'inspection', 'possession']);
    const insp = (await dates()).find((r) => r.kind === 'inspection')!;
    expect(insp.periodDays).toBe(14);
  });

  it('changing the inputs recomputes unpinned rows', async () => {
    await withUser(db, A, (tx) =>
      saveScheduleInputs(tx, dealId, { acceptanceAt: '2026-10-09T23:30', closingDate: '2026-11-26', period_inspection: '10' }),
    );
    const k = Object.fromEntries((await dates()).map((r) => [r.kind, r]));
    expect(k.inspection!.periodDays).toBe(10);
    expect(k.financing).toBeDefined(); // override cleared -> default comes back
  });

  it("user B cannot save inputs on A's deal", async () => {
    await expect(
      withUser(db, B, (tx) => saveScheduleInputs(tx, dealId, { acceptanceAt: '2027-01-01T10:00' })),
    ).rejects.toThrow(/not found/);
    expect((await deal())!.mutualAcceptanceAt!.toISOString()).toBe('2026-10-10T06:30:00.000Z');
  });

  it('rejects invalid input without changing anything', async () => {
    await expect(
      withUser(db, A, (tx) => saveScheduleInputs(tx, dealId, { acceptanceAt: 'nope' })),
    ).rejects.toThrow();
    expect((await deal())!.mutualAcceptanceAt).not.toBeNull();
  });
});

describe('deadline rows', () => {
  it('marks done and undoes', async () => {
    const row = (await dates()).find((r) => r.kind === 'earnest_money')!;
    await withUser(db, A, (tx) => setDealDateDone(tx, row.id, true));
    expect((await dates()).find((r) => r.id === row.id)!.completedAt).not.toBeNull();
    await withUser(db, A, (tx) => setDealDateDone(tx, row.id, false));
    expect((await dates()).find((r) => r.id === row.id)!.completedAt).toBeNull();
  });

  it("user B cannot mark A's deadline done", async () => {
    const row = (await dates())[0]!;
    await expect(withUser(db, B, (tx) => setDealDateDone(tx, row.id, true))).rejects.toThrow(/not found/);
    expect((await dates())[0]!.completedAt).toBeNull();
  });

  it('pins an exact date and restores the computed one', async () => {
    const row = (await dates()).find((r) => r.kind === 'inspection')!;
    const computed = row.dueAt.toISOString();
    await withUser(db, A, (tx) => pinDealDate(tx, row.id, '2026-10-30'));
    let now = (await dates()).find((r) => r.id === row.id)!;
    expect(now.isOverridden).toBe(true);
    expect(now.dueAt.toISOString()).toBe('2026-10-31T04:00:00.000Z');
    await withUser(db, A, (tx) => restoreComputedDate(tx, row.id));
    now = (await dates()).find((r) => r.id === row.id)!;
    expect(now.isOverridden).toBe(false);
    expect(now.dueAt.toISOString()).toBe(computed);
  });

  it("user B cannot pin or restore A's deadline", async () => {
    const row = (await dates()).find((r) => r.kind === 'inspection')!;
    await expect(withUser(db, B, (tx) => pinDealDate(tx, row.id, '2026-12-01'))).rejects.toThrow(/not found/);
    await expect(withUser(db, B, (tx) => restoreComputedDate(tx, row.id))).rejects.toThrow(/not found/);
  });

  it('adds and deletes custom deadlines at 9 pm Pacific', async () => {
    const id = await withUser(db, A, (tx) => addCustomDeadline(tx, dealId, { label: ' Walkthrough ', date: '2026-11-20' }));
    const row = (await dates()).find((r) => r.id === id)!;
    expect(row).toMatchObject({ kind: 'custom', label: 'Walkthrough', periodDays: null });
    expect(row.dueAt.toISOString()).toBe('2026-11-21T05:00:00.000Z');
    await withUser(db, A, (tx) => deleteCustomDeadline(tx, id));
    expect((await dates()).find((r) => r.id === id)).toBeUndefined();
  });

  it('custom deadlines survive a schedule re-save, and engine rows cannot be deleted through the custom path', async () => {
    const id = await withUser(db, A, (tx) => addCustomDeadline(tx, dealId, { label: 'Keep me', date: '2026-11-22' }));
    await withUser(db, A, (tx) => saveScheduleInputs(tx, dealId, { acceptanceAt: '2026-10-09T23:30' }));
    expect((await dates()).find((r) => r.id === id)).toBeDefined();
    const engine = (await dates()).find((r) => r.kind === 'inspection')!;
    await expect(withUser(db, A, (tx) => deleteCustomDeadline(tx, engine.id))).rejects.toThrow(/not found/);
  });

  it("user B cannot add to or delete from A's deal", async () => {
    await expect(
      withUser(db, B, (tx) => addCustomDeadline(tx, dealId, { label: 'Sneaky', date: '2026-11-20' })),
    ).rejects.toThrow();
    const custom = (await dates()).find((r) => r.kind === 'custom')!;
    await expect(withUser(db, B, (tx) => deleteCustomDeadline(tx, custom.id))).rejects.toThrow(/not found/);
    expect((await dates()).find((r) => r.id === custom.id)).toBeDefined();
  });
});

describe('delete deal', () => {
  it('removes the deal and its deadlines', async () => {
    await withUser(db, A, (tx) => deleteDeal(tx, dealId));
    expect(await deal()).toBeUndefined();
    expect(await dates()).toHaveLength(0);
  });
});
