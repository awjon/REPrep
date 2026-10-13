import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDeal } from '@/lib/deals/mutations';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';
import { termSheetDefaults } from '@/lib/term-sheet/defaults';
import { saveTermSheet } from '@/lib/term-sheet/mutations';
import { getSavedTermSheet } from '@/lib/term-sheet/queries';
import { dataToForm } from '@/lib/term-sheet/schema';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const A = randomUUID();
const B = randomUUID();
let dealId: string;

const form = (over: Record<string, string> = {}) => ({
  ...dataToForm(
    termSheetDefaults({
      address: '5 TS Test Ave',
      parcelPin: null,
      closingDate: '2026-12-01',
      possessionDaysAfterClosing: 0,
      periodOverrides: {},
    }),
  ),
  price: '800000',
  ...over,
});

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${A}, 'a-ts@test.local'), (${B}, 'b-ts@test.local')`;
  dealId = await withUser(db, A, (tx) => createDeal(tx, { address: '5 TS Test Ave' }));
});
afterAll(async () => {
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});

const count = (user: string) =>
  withUser(db, user, async (tx) => (await tx.select().from(schema.termSheets)).length);

describe('term sheet persistence', () => {
  it('has nothing saved at first', async () => {
    expect(await withUser(db, A, (tx) => getSavedTermSheet(tx, dealId))).toBeNull();
  });

  it('saves, then updates in place (one row per deal)', async () => {
    await withUser(db, A, (tx) => saveTermSheet(tx, dealId, form()));
    const first = (await withUser(db, A, (tx) => getSavedTermSheet(tx, dealId)))!;
    expect(first.data.price).toBe(800000);
    expect(first.data.closingDate).toBe('2026-12-01');

    await withUser(db, A, (tx) => saveTermSheet(tx, dealId, form({ price: '825000', notes: 'revised', closingDate: '2026-12-10' })));
    const second = (await withUser(db, A, (tx) => getSavedTermSheet(tx, dealId)))!;
    expect(second.data).toMatchObject({ price: 825000, notes: 'revised', closingDate: '2026-12-10' });
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
    expect(await count(A)).toBe(1);

    const [row] = await client`select closing_date::text as d, user_id from term_sheets where deal_id = ${dealId}`;
    expect(row).toMatchObject({ d: '2026-12-10', user_id: A });
  });

  it('rejects invalid input without writing', async () => {
    await expect(withUser(db, A, (tx) => saveTermSheet(tx, dealId, form({ price: '-1' })))).rejects.toThrow(/invalid term sheet/);
    expect((await withUser(db, A, (tx) => getSavedTermSheet(tx, dealId)))!.data.price).toBe(825000);
  });

  it("another user cannot read or write this user's term sheet", async () => {
    expect(await withUser(db, B, (tx) => getSavedTermSheet(tx, dealId))).toBeNull();
    expect(await count(B)).toBe(0);
    await expect(withUser(db, B, (tx) => saveTermSheet(tx, dealId, form({ price: '1' })))).rejects.toThrow(/not found/);
    expect((await withUser(db, A, (tx) => getSavedTermSheet(tx, dealId)))!.data.price).toBe(825000);
  });

  it('returns null if stored JSON no longer validates', async () => {
    await client`update term_sheets set data = '{"bad":true}'::jsonb where deal_id = ${dealId}`;
    expect(await withUser(db, A, (tx) => getSavedTermSheet(tx, dealId))).toBeNull();
  });
});
