// M0 acceptance: a second user cannot read, change, or attach to the first user's rows.
// Runs against a real Postgres with the Supabase shim: `npm run test:db`.

import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });

const A = randomUUID();
const B = randomUUID();
let dealA: string;

/** Postgres SQLSTATE of a rejected query (Drizzle wraps the driver error in `cause`). */
async function pgCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    return err.cause?.code ?? err.code;
  }
}

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${A}, 'a@test.local'), (${B}, 'b@test.local')`;
  const [row] = await withUser(db, A, (tx) =>
    tx.insert(schema.deals).values({ address: '1 Alki Ave SW, Seattle' }).returning(),
  );
  dealA = row!.id;
});

afterAll(async () => {
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});

describe('row level security', () => {
  it('stamps user_id from the session, not the caller', async () => {
    const rows = await withUser(db, A, (tx) => tx.select().from(schema.deals).where(eq(schema.deals.id, dealA)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(A);
  });

  it("hides another user's deals", async () => {
    const rows = await withUser(db, B, (tx) => tx.select().from(schema.deals));
    expect(rows.find((r) => r.id === dealA)).toBeUndefined();
  });

  it("cannot update or delete another user's deal", async () => {
    const updated = await withUser(db, B, (tx) =>
      tx.update(schema.deals).set({ notes: 'pwned' }).where(eq(schema.deals.id, dealA)).returning(),
    );
    const deleted = await withUser(db, B, (tx) =>
      tx.delete(schema.deals).where(eq(schema.deals.id, dealA)).returning(),
    );
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    const [still] = await client`select notes from deals where id = ${dealA}`;
    expect(still!.notes).toBeNull();
  });

  it('cannot insert a row owned by someone else', async () => {
    // 42501 = insufficient_privilege (RLS WITH CHECK violation)
    expect(await pgCode(withUser(db, B, (tx) => tx.insert(schema.deals).values({ address: 'x', userId: A })))).toBe(
      '42501',
    );
  });

  it("cannot attach a child row to another user's deal", async () => {
    // 23503 = foreign_key_violation: (deal_id, B) does not exist
    const code = await pgCode(
      withUser(db, B, (tx) =>
        tx.insert(schema.dealDates).values({ dealId: dealA, kind: 'inspection', label: 'Inspection', dueAt: new Date() }),
      ),
    );
    expect(code).toBe('23503');
  });

  it('anon sees nothing', async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role anon`);
      return tx.select().from(schema.deals);
    });
    expect(rows).toHaveLength(0);
  });

  it('every app table has RLS enabled and at least one policy', async () => {
    const tables = await client`
      select c.relname, c.relrowsecurity,
             (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)::int as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'spatial_ref_sys'
        and c.relname not like 'kc\\_%' and c.relname not like 'sea\\_%' and c.relname not like 'ingest\\_%'`;
    expect(tables.length).toBeGreaterThanOrEqual(8);
    for (const t of tables) {
      expect.soft(t.relrowsecurity, `${t.relname} RLS`).toBe(true);
      expect.soft(t.policies, `${t.relname} policies`).toBeGreaterThan(0);
    }
  });
});
