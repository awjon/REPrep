import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDeal } from '@/lib/deals/mutations';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';
import { ecaFlags, lotFlags } from '@/lib/lot/flags';
import { setParcelPin } from '@/lib/lot/mutations';
import { loadLotFacts } from '@/lib/lot/queries';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const A = randomUUID();
const B = randomUUID();
let dealId: string;
const PIN_SEA = '9800000001';
const PIN_BUR = '9800000002';
const PIN_NONE = '9800000003';

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${A}, 'a-lot@test.local'), (${B}, 'b-lot@test.local')`;
  await client`insert into kc_parcels (pin, present_use, sq_ft_lot, current_zoning, district_name, lat, lon) values
    (${PIN_SEA}, 2, 3950, 'NR3', 'SEATTLE', 47.58, -122.4),
    (${PIN_BUR}, 2, 7200, null, 'BURIEN', null, null)`;
  await client`insert into kc_res_buildings (pin, bldg_nbr, nbr_living_units, stories, sq_ft_tot_living, yr_built) values
    (${PIN_SEA}, 1, 2, 1.5, 1800, 1948)`;
  dealId = await withUser(db, A, (tx) => createDeal(tx, { address: '9 Lot Test St' }));
});
afterAll(async () => {
  await client`delete from kc_res_buildings where pin like '98%'`;
  await client`delete from kc_parcels where pin like '98%'`;
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});

const pinOf = async (user = A) =>
  (await withUser(db, user, (tx) => tx.select().from(schema.deals).where(eq(schema.deals.id, dealId))))[0]?.parcelPin;

describe('parcel PIN save', () => {
  it('saves a 10-digit PIN, tolerating hyphens and spaces', async () => {
    expect(await withUser(db, A, (tx) => setParcelPin(tx, dealId, ' 980000-0001 '))).toBe(PIN_SEA);
    expect(await pinOf()).toBe(PIN_SEA);
  });
  it('rejects malformed PINs without changing the deal', async () => {
    for (const bad of ['123', 'abcdefghij', '12345678901', '', null]) {
      await expect(withUser(db, A, (tx) => setParcelPin(tx, dealId, bad))).rejects.toThrow();
    }
    expect(await pinOf()).toBe(PIN_SEA);
  });
  it("another user cannot set the PIN on this user's deal", async () => {
    await expect(withUser(db, B, (tx) => setParcelPin(tx, dealId, PIN_BUR))).rejects.toThrow(/not found/);
    expect(await pinOf()).toBe(PIN_SEA);
    expect(await pinOf(B)).toBeUndefined();
  });
});

describe('loadLotFacts under RLS', () => {
  it('reads parcel and building facts for a signed-in user and produces flags', async () => {
    const facts = (await withUser(db, A, (tx) => loadLotFacts(tx, PIN_SEA)))!;
    expect(facts).toMatchObject({ zoning: 'NR3', district: 'SEATTLE', lotSqFt: 3950, lat: 47.58 });
    expect(facts.buildings).toEqual([{ livingUnits: 2, livingSqFt: 1800, yearBuilt: 1948, stories: 1.5 }]);
    const t = lotFlags(facts).map((f) => f.text);
    expect(t).toContain('Zoning on record: NR3');
    expect(t).toContain('Building record shows 2 living units.');
    expect(ecaFlags({ status: 'not_configured' })[0]!.text).toMatch(/not checked/);
  });
  it('handles a non-Seattle parcel with missing zoning and no building', async () => {
    const facts = (await withUser(db, B, (tx) => loadLotFacts(tx, PIN_BUR)))!;
    const t = lotFlags(facts).map((f) => f.text);
    expect(t).toContain('No zoning recorded on the parcel.');
    expect(t).toContain('Parcel is outside the City of Seattle (district: BURIEN); city rules differ.');
    expect(t).toContain('No residential building record found for this parcel.');
  });
  it('returns null for an unknown PIN', async () => {
    expect(await withUser(db, A, (tx) => loadLotFacts(tx, PIN_NONE))).toBeNull();
  });
});
