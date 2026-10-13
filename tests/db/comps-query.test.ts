// Runs against the real local database. Fixtures use PINs starting with 99 (area 9901 / sub-area
// 91, coordinates near 10N 10E so nothing else matches) and only those rows are deleted.

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { saveCompSet, setDealParcelPin, listCompSets } from '@/lib/comps/mutations';
import { DEFAULT_PARAMS } from '@/lib/comps/params';
import { findComps, getSubject, searchParcels } from '@/lib/comps/query';
import { runComps } from '@/lib/comps/service';
import type { CompParams } from '@/lib/comps/types';
import { createDeal } from '@/lib/deals/mutations';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 2, onnotice: () => {} });
const db: Db = drizzle(client, { schema });
const A = randomUUID();
const B = randomUUID();
const ASOF = '2026-10-12';
const AREA = 9901;
const SUB = 91;
const OTHER_SUB = 92;
const LAT = 10.0;
const LON = 10.0;

type P = {
  pin: string;
  address: string;
  sub?: number;
  lat?: number | null;
  lon?: number | null;
  sqft?: number | null;
  units?: number;
  beds?: number;
  yr?: number;
  buildings?: number;
};

const parcels: P[] = [
  { pin: '9900000001', address: '100 TESTVIEW AVE SW', lat: LAT, lon: LON, sqft: 2000, beds: 3, yr: 1960 }, // subject
  { pin: '9900000002', address: '102 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.001, sqft: 2000, beds: 3, yr: 1965 }, // ~0.07mi
  { pin: '9900000003', address: '104 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.01, sqft: 2200, beds: 4, yr: 1990 }, // ~0.68mi
  { pin: '9900000004', address: '106 TESTVIEW AVE SW', sub: OTHER_SUB, lat: LAT, lon: LON + 0.002, sqft: 2000, beds: 3, yr: 1961 }, // other sub-area, ~0.14mi
  { pin: '9900000005', address: '108 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0005, sqft: 2600, beds: 3, yr: 1960 }, // 30% bigger
  { pin: '9900000006', address: '110 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0006, sqft: 2000, units: 2, beds: 3, yr: 1960 }, // duplex
  { pin: '9900000007', address: '112 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0007, sqft: 2000, beds: 3, yr: 1960, buildings: 2 }, // two buildings
  { pin: '9900000008', address: '114 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0008, sqft: 2000, beds: 3, yr: 1960 }, // sales: warning / multi / dates
  { pin: '9900000009', address: '116 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0009, sqft: 2000, beds: 3, yr: 1960 }, // multi-parcel partner
  { pin: '9900000010', address: '118 TESTVIEW AVE SW', lat: null, lon: null, sqft: 2000, beds: 3, yr: 1960 }, // no coordinates
  { pin: '9900000011', address: '120 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0011, sqft: 2000, beds: 5, yr: 1960 }, // beds +2
  { pin: '9900000012', address: '122 TESTVIEW AVE SW', lat: LAT, lon: LON + 0.0012, sqft: null, beds: 3, yr: 1960 }, // no living area
];

type S = { excise: string; pin: string; date: string; price: number; warning?: string | null };
const sales: S[] = [
  { excise: '9900000101', pin: '9900000001', date: '2026-08-01', price: 999_999 }, // subject's own sale
  { excise: '9900000102', pin: '9900000002', date: '2026-09-01', price: 1_000_000 },
  { excise: '9900000103', pin: '9900000003', date: '2026-07-01', price: 1_100_000 },
  { excise: '9900000104', pin: '9900000004', date: '2026-08-15', price: 1_050_000 },
  { excise: '9900000105', pin: '9900000005', date: '2026-08-10', price: 1_300_000 },
  { excise: '9900000106', pin: '9900000006', date: '2026-08-11', price: 1_200_000 },
  { excise: '9900000107', pin: '9900000007', date: '2026-08-12', price: 1_200_000 },
  { excise: '9900000108', pin: '9900000008', date: '2026-06-01', price: 900_000 }, // good, older
  { excise: '9900000109', pin: '9900000008', date: '2026-05-01', price: 880_000, warning: '18' }, // warning
  { excise: '9900000110', pin: '9900000008', date: '2026-04-01', price: 870_000, warning: '  ' }, // blank warning = ok
  { excise: '9900000111', pin: '9900000008', date: '2024-09-01', price: 700_000 }, // 25 months ago
  { excise: '9900000112', pin: '9900000008', date: '2025-06-01', price: 800_000 }, // ~16 months ago
  { excise: '9900000113', pin: '9900000008', date: '2026-03-01', price: 0 }, // zero price
  { excise: '9900000114', pin: '9900000008', date: '2026-02-01', price: 950_000 }, // multi-parcel
  { excise: '9900000114', pin: '9900000009', date: '2026-02-01', price: 950_000 },
  { excise: '9900000115', pin: '9900000010', date: '2026-09-05', price: 1_010_000 }, // no coordinates
  { excise: '9900000116', pin: '9900000011', date: '2026-09-06', price: 1_020_000 },
  { excise: '9900000117', pin: '9900000012', date: '2026-09-07', price: 1_030_000 },
];

const ids = (r: { comps: { exciseTaxNbr: string }[] }) => r.comps.map((c) => c.exciseTaxNbr.slice(-3));
const run = async (p: Partial<CompParams> = {}, pin = '9900000001') =>
  withUser(db, A, async (tx) => findComps(tx, (await getSubject(tx, pin))!, { ...DEFAULT_PARAMS, ...p }, ASOF));

async function cleanup() {
  await client`delete from kc_sales where pin like '99%'`;
  await client`delete from kc_res_buildings where pin like '99%'`;
  await client`delete from kc_parcels where pin like '99%'`;
}

beforeAll(async () => {
  await cleanup();
  await client`insert into auth.users (id, email) values (${A}, 'a-comps@test.local'), (${B}, 'b-comps@test.local')`;
  for (const p of parcels) {
    await client`insert into kc_parcels (pin, area, sub_area, sq_ft_lot, address, zip, lat, lon, present_use)
      values (${p.pin}, ${AREA}, ${p.sub ?? SUB}, 5000, ${p.address}, '98116', ${p.lat ?? null}, ${p.lon ?? null}, 2)`;
    for (let b = 1; b <= (p.buildings ?? 1); b++) {
      await client`insert into kc_res_buildings (pin, bldg_nbr, address, zip, nbr_living_units, bldg_grade, sq_ft_tot_living,
          bedrooms, bath_full, bath_3qtr, bath_half, yr_built)
        values (${p.pin}, ${b}, ${p.address}, '98116', ${p.units ?? 1}, 8, ${p.sqft ?? null}, ${p.beds ?? 3}, 2, 1, 0, ${p.yr ?? 1960})`;
    }
  }
  for (const s of sales) {
    await client`insert into kc_sales (excise_tax_nbr, pin, document_date, sale_price, sale_warning)
      values (${s.excise}, ${s.pin}, ${s.date}, ${s.price}, ${s.warning ?? null})`;
  }
});

afterAll(async () => {
  await cleanup();
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});

describe('subject facts', () => {
  it('reads parcel + first building', async () => {
    const s = await withUser(db, A, (tx) => getSubject(tx, '9900000001'));
    expect(s).toMatchObject({
      address: '100 TESTVIEW AVE SW',
      area: AREA,
      subArea: SUB,
      sqFtLiving: 2000,
      bedrooms: 3,
      baths: 2.75,
      yrBuilt: 1960,
      grade: 8,
      sqFtLot: 5000,
      livingUnits: 1,
      lat: LAT,
    });
  });
  it('is null for an unknown PIN', async () => {
    expect(await withUser(db, A, (tx) => getSubject(tx, '9999999999'))).toBeNull();
  });
});

describe('findComps', () => {
  it('default: same area+sub-area, 12 months, +/-25% band, most recent first, subject excluded', async () => {
    const r = await run();
    // In: 116 (beds 5, no beds filter by default), 115 (no coordinates, area match), 102, 103 (+10% sqft, built 1990),
    // 108 (06-01), 110 (blank warning, 04-01).
    // Out: 101 subject's own sale, 104 other sub-area, 105 +30% sqft, 106 duplex, 107 two buildings,
    // 109 warning, 111 and 112 older than 12 months, 113 zero price, 114 multi-parcel, 117 no living area.
    expect(ids(r)).toEqual(['116', '115', '102', '103', '108', '110']);
    expect(r.unavailable).toBeNull();
    expect(r.units).toBe(1);
  });

  it('date window: 6 / 12 / 24 months', async () => {
    const six = await run({ months: 6 });
    // cutoff 2026-04-12: 06-01 is inside, 04-01 is outside
    expect(ids(six)).toContain('108');
    expect(ids(six)).not.toContain('110');
    const twentyFour = await run({ months: 24 });
    expect(ids(twentyFour)).toContain('112'); // 2025-06-01
    expect(ids(twentyFour)).not.toContain('111'); // 2024-09-01 is older than 24 months (cutoff 2024-10-12)
    const twelve = await run({ months: 12 });
    expect(ids(twelve)).not.toContain('112');
  });

  it('excludes sales with a warning code but keeps blank warnings', async () => {
    const r = await run({ months: 24 });
    expect(ids(r)).not.toContain('109');
    expect(ids(r)).toContain('110');
  });

  it('excludes zero-price and multi-parcel sales', async () => {
    const r = await run({ months: 24 });
    expect(ids(r)).not.toContain('113');
    expect(ids(r)).not.toContain('114');
  });

  it('excludes parcels with several buildings and a different unit count', async () => {
    const r = await run({ months: 24 });
    expect(ids(r)).not.toContain('107');
    expect(ids(r)).not.toContain('106');
  });

  it('matches the subject unit count', async () => {
    // make the duplex the subject: only duplexes qualify
    const r = await run({ months: 24 }, '9900000006');
    expect(r.units).toBe(2);
    expect(r.comps).toEqual([]);
  });

  it('living area band: 15 / 25 / 40 percent', async () => {
    // 2200 (+10%) is inside every band; 2600 (+30%) only inside 40%
    expect(ids(await run({ sqftPct: 15 }))).toContain('103');
    expect(ids(await run({ sqftPct: 15 }))).not.toContain('105');
    expect(ids(await run({ sqftPct: 25 }))).not.toContain('105');
    expect(ids(await run({ sqftPct: 40 }))).toContain('105');
  });

  it('area vs radius', async () => {
    const area = await run();
    expect(ids(area)).not.toContain('104'); // other sub-area
    const r05 = await run({ location: { kind: 'radius', miles: 0.5 } });
    // radius ignores sub-area: 104 (other sub-area, ~0.14mi) is in; 103 (~0.68mi) is out; no-coordinate parcel is out
    expect(ids(r05)).toContain('104');
    expect(ids(r05)).not.toContain('103');
    expect(ids(r05)).not.toContain('115');
    const r1 = await run({ location: { kind: 'radius', miles: 1 } });
    expect(ids(r1)).toContain('103');
    const r025 = await run({ location: { kind: 'radius', miles: 0.25 } });
    expect(ids(r025)).not.toContain('103');
    for (const c of r025.comps) expect(c.distanceMiles).not.toBeNull();
    const d102 = r1.comps.find((c) => c.exciseTaxNbr.endsWith('102'))!.distanceMiles!;
    expect(d102).toBeGreaterThan(0.05);
    expect(d102).toBeLessThan(0.1);
    for (const c of area.comps) expect(c.distanceMiles).toBeNull();
  });

  it('a subject without coordinates falls back to area', async () => {
    const r = await run({ location: { kind: 'radius', miles: 1 } }, '9900000010');
    expect(r.locationFellBack).toBe(true);
    expect(r.unavailable).toBeNull();
    expect(r.comps.length).toBeGreaterThan(0);
  });

  it('a subject without living area has nothing to compare', async () => {
    const r = await run({}, '9900000012');
    expect(r.comps).toEqual([]);
    expect(r.unavailable).toMatch(/living area/);
  });

  it('year-built window and bedrooms filters', async () => {
    const yr = await run({ yearWindow: 20, location: { kind: 'radius', miles: 1 } });
    expect(ids(yr)).not.toContain('103'); // built 1990, subject 1960 -> 30 years apart
    expect(ids(yr)).toContain('102');
    const beds = await run({ sameBeds: true });
    expect(ids(beds)).not.toContain('116'); // 5 bedrooms vs subject 3
    expect(ids(beds)).toContain('102');
    const bedsRadius = await run({ sameBeds: true, location: { kind: 'radius', miles: 1 } });
    expect(ids(bedsRadius)).toContain('103'); // 4 bedrooms is within 1 of 3
  });

  it('limits to 50 and orders newest first', async () => {
    const extra = Array.from({ length: 55 }, (_, i) => ({
      pin: `99000002${String(i).padStart(2, '0')}`,
      excise: `990000030${String(i).padStart(2, '0')}`,
    }));
    for (const e of extra) {
      await client`insert into kc_parcels (pin, area, sub_area, address, lat, lon) values (${e.pin}, ${AREA}, ${SUB}, 'X', ${LAT}, ${LON})`;
      await client`insert into kc_res_buildings (pin, bldg_nbr, nbr_living_units, sq_ft_tot_living, bedrooms, yr_built) values (${e.pin}, 1, 1, 2000, 3, 1960)`;
      await client`insert into kc_sales (excise_tax_nbr, pin, document_date, sale_price)
        values (${e.excise}, ${e.pin}, (${ASOF}::date - ${i(e)}::int), 1000000)`;
    }
    try {
      const r = await run();
      expect(r.comps).toHaveLength(50);
      const dates = r.comps.map((c) => c.documentDate);
      expect([...dates].sort().reverse()).toEqual(dates);
    } finally {
      await client`delete from kc_sales where pin like '990000020%' or pin like '990000021%' or pin like '990000022%' or pin like '990000023%' or pin like '990000024%' or pin like '990000025%'`;
      await client`delete from kc_res_buildings where pin like '99000002%'`;
      await client`delete from kc_parcels where pin like '99000002%'`;
    }
  });
});

function i(e: { pin: string }) {
  return Number(e.pin.slice(-2));
}

describe('runComps', () => {
  it('computes stats, method and a snapshot', async () => {
    const rep = await withUser(db, A, async (tx) =>
      runComps(tx, (await getSubject(tx, '9900000001'))!, { ...DEFAULT_PARAMS, months: 24 }, ASOF),
    );
    expect(rep.stats.count).toBe(rep.result.comps.length);
    expect(rep.method).toContain('last 24 months');
    expect(rep.snapshot.subjectPin).toBe('9900000001');
    expect(rep.snapshot.comps).toEqual(rep.result.comps);
  });
});

describe('parcel search', () => {
  it('matches by normalized prefix, case-insensitively', async () => {
    const hits = await withUser(db, A, (tx) => searchParcels(tx, '100 testview avenue southwest'));
    expect(hits.map((h) => h.pin)).toEqual(['9900000001']);
  });
  it('matches contains and orders prefix matches first', async () => {
    const hits = await withUser(db, A, (tx) => searchParcels(tx, 'testview ave'));
    expect(hits.length).toBe(12);
    expect(new Set(hits.map((h) => h.pin)).size).toBe(hits.length);
    expect(hits[0]!.address).toBe('100 TESTVIEW AVE SW');
  });
  it('ignores very short or empty input and treats % literally', async () => {
    expect(await withUser(db, A, (tx) => searchParcels(tx, 'te'))).toEqual([]);
    expect(await withUser(db, A, (tx) => searchParcels(tx, '%%%'))).toEqual([]);
  });
  it('finds a parcel by its building address when the parcel has none', async () => {
    await client`insert into kc_parcels (pin, area, sub_area) values ('9900000300', ${AREA}, ${SUB})`;
    await client`insert into kc_res_buildings (pin, bldg_nbr, address) values ('9900000300', 1, '777 ONLYBLDG ST')`;
    const hits = await withUser(db, A, (tx) => searchParcels(tx, '777 onlybldg street'));
    expect(hits.map((h) => h.pin)).toEqual(['9900000300']);
  });
});

describe('deal PIN under RLS', () => {
  let dealId: string;
  beforeAll(async () => {
    dealId = await withUser(db, A, (tx) => createDeal(tx, { address: '100 Testview Ave SW' }));
  });

  it('saves and changes the PIN', async () => {
    await withUser(db, A, (tx) => setDealParcelPin(tx, dealId, ' 9900000001 '));
    const get = async () =>
      (await withUser(db, A, (tx) => tx.select().from(schema.deals).where(eq(schema.deals.id, dealId))))[0]!.parcelPin;
    expect(await get()).toBe('9900000001');
    await withUser(db, A, (tx) => setDealParcelPin(tx, dealId, '9900000002'));
    expect(await get()).toBe('9900000002');
  });

  it('rejects malformed and unknown PINs', async () => {
    await expect(withUser(db, A, (tx) => setDealParcelPin(tx, dealId, '123'))).rejects.toThrow();
    await expect(withUser(db, A, (tx) => setDealParcelPin(tx, dealId, '9999999998'))).rejects.toThrow(/parcel not found/);
  });

  it("user B cannot set user A's deal PIN", async () => {
    await expect(withUser(db, B, (tx) => setDealParcelPin(tx, dealId, '9900000003'))).rejects.toThrow(/deal not found/);
    const [d] = await withUser(db, A, (tx) => tx.select().from(schema.deals).where(eq(schema.deals.id, dealId)));
    expect(d!.parcelPin).toBe('9900000002');
  });

  it('saves and lists comp sets, newest first, private to the owner', async () => {
    await withUser(db, A, (tx) => saveCompSet(tx, dealId, { months: 12 }, { n: 1 }));
    await new Promise((r) => setTimeout(r, 10));
    await withUser(db, A, (tx) => saveCompSet(tx, dealId, { months: 24 }, { n: 2 }));
    const list = await withUser(db, A, (tx) => listCompSets(tx, dealId));
    expect(list.map((s) => s.results)).toEqual([{ n: 2 }, { n: 1 }]);
    expect(list[0]!.params).toEqual({ months: 24 });
    expect(list[0]!.userId).toBe(A);
    expect(await withUser(db, B, (tx) => listCompSets(tx, dealId))).toEqual([]);
    await expect(withUser(db, B, (tx) => saveCompSet(tx, dealId, {}, {}))).rejects.toThrow(/deal not found/);
  });
});
