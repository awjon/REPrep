import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADDRESS_CSV, appServer, connect, deps, fixtureServer, resetTables, standardSources, zipOf, PARCEL_CSV, SALES_CSV, TOKEN, type Fixture } from './helpers.js';
import { ADVISORY_LOCK_KEY, runIngest } from '../src/run.js';

const sql = connect();
let fx: Fixture;
let app: Awaited<ReturnType<typeof appServer>>;

beforeAll(async () => {
  fx = await fixtureServer();
  app = await appServer(sql);
});
afterAll(async () => {
  await app.close();
  await fx.close();
  await sql.end();
});
beforeEach(async () => {
  await resetTables(sql);
  fx.hits.length = 0;
});

const count = async (t: string) => Number((await sql.unsafe(`select count(*)::int n from ${t}`))[0]!.n);

describe('POST /run', () => {
  it('first load inserts rows and returns the contract response', async () => {
    const sources = await standardSources(fx);
    const res = await app.post({ force: false, sources });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      changed: ['parcel', 'resbldg', 'sales', 'lookup'], // contract order: parcel -> resbldg -> sales
      unchanged: [],
      rows: { parcel: 3, resbldg: 3, sales: 2, lookup: 0 },
      durationMs: expect.any(Number),
    });
    expect(await count('kc_parcels')).toBe(3);
    expect(await count('kc_res_buildings')).toBe(3);
    // 3000001 (deduped), 3000005. Filtered: price 0, <2015, impossible date.
    const sales = await sql`select excise_tax_nbr, pin, document_date::text d, sale_price, sale_warning from kc_sales order by excise_tax_nbr`;
    expect(sales.map((r) => [r.excise_tax_nbr, r.pin, r.d, r.sale_price, r.sale_warning])).toEqual([
      ['3000001', '0012340056', '2020-01-15', 850000, null],
      ['3000005', '0000050007', '2021-06-01', 425000, '11 15'],
    ]);
    const [p] = await sql`select * from kc_parcels where pin = '0012340056'`;
    expect(p).toMatchObject({ area: 15, sub_area: 3, prop_type: 'R', sq_ft_lot: 5000, current_zoning: 'NR3' });
    const [b] = await sql`select * from kc_res_buildings where pin = '0012340056'`;
    expect(b).toMatchObject({ address: '123 MAIN ST', zip: '98116', stories: '1.5', bedrooms: 3, yr_built: 1925 });
    const runs = await sql`select source, etag, rows from ingest_runs order by source`;
    expect(runs.map((r) => [r.source, r.etag, r.rows])).toEqual([
      ['lookup', null, 0], ['parcel', '"p1"', 3], ['resbldg', '"r1"', 3], ['sales', '"s1"', 2],
    ]);
  });

  it('second run with same ETag is unchanged and downloads nothing', async () => {
    const sources = await standardSources(fx);
    await app.post({ force: false, sources });
    fx.hits.length = 0;
    const body = await (await app.post({ force: false, sources })).json();
    expect(body).toMatchObject({ ok: true, changed: [], unchanged: ['parcel', 'resbldg', 'sales', 'lookup'], rows: {} });
    expect(fx.hits.every((h) => h.method === 'HEAD')).toBe(true);
  });

  it('force reloads; a new ETag reloads only that source', async () => {
    const sources = await standardSources(fx);
    await app.post({ force: false, sources });
    const forced = await (await app.post({ force: true, sources })).json();
    expect(forced.changed).toEqual(['parcel', 'resbldg', 'sales', 'lookup']);
    expect(await count('ingest_runs')).toBe(8);

    fx.set('/sales.zip', { body: await zipOf({ 'EXTR_RPSale.csv': SALES_CSV }), etag: '"s2"' });
    const body = await (await app.post({ force: false, sources })).json();
    expect(body.changed).toEqual(['sales']);
    expect(body.unchanged).toEqual(['parcel', 'resbldg', 'lookup']);
  });

  it('falls back to GET headers when HEAD is refused', async () => {
    const sources = await standardSources(fx);
    fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': PARCEL_CSV }), etag: '"p1"', headStatus: 405 });
    const only = sources.filter((s) => s.name === 'parcel');
    await app.post({ force: false, sources: only });
    fx.hits.length = 0;
    const body = await (await app.post({ force: false, sources: only })).json();
    expect(body.unchanged).toEqual(['parcel']);
    expect(fx.hits.map((h) => h.method)).toEqual(['HEAD', 'GET']);
  });

  it('a corrupt file fails that source, keeps previous rows, records nothing', async () => {
    const sources = await standardSources(fx);
    await app.post({ force: false, sources });
    const good = await zipOf({ 'EXTR_RPSale.csv': SALES_CSV });
    fx.set('/sales.zip', { body: good.subarray(0, Math.floor(good.length / 2)), etag: '"s2"' });
    const res = await app.post({ force: false, sources });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_file', source: 'sales' });
    expect(await count('kc_sales')).toBe(2);
    expect((await sql`select etag from ingest_runs where source='sales'`).map((r) => r.etag)).toEqual(['"s1"']);
  });

  it('a body shorter than content-length fails as download_failed/incomplete', async () => {
    const sources = await standardSources(fx);
    const good = await zipOf({ 'EXTR_Parcel.csv': PARCEL_CSV });
    fx.set('/parcel.zip', { body: good.subarray(0, 40), declaredLength: good.length, etag: '"x"' });
    const res = await app.post({ force: false, sources });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, source: 'parcel' });
    expect(await count('kc_parcels')).toBe(0);
  });

  it('missing required column fails with missing_columns', async () => {
    const sources = await standardSources(fx);
    fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': 'Major,Minor\n1,1' }), etag: '"bad"' });
    const res = await app.post({ force: false, sources });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: 'missing_columns', source: 'parcel' });
  });

  it('wrong file inside the zip fails', async () => {
    const sources = await standardSources(fx);
    fx.set('/parcel.zip', { body: await zipOf({ 'readme.txt': 'hi' }), etag: '"bad"' });
    const res = await app.post({ force: false, sources });
    expect(await res.json()).toEqual({ ok: false, error: 'invalid_file', source: 'parcel' });
  });

  it('an empty file (header only) fails with empty_source', async () => {
    const sources = await standardSources(fx);
    const header = PARCEL_CSV.split('\r\n')[0]!;
    fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': header }), etag: '"e"' });
    const res = await app.post({ force: false, sources });
    expect(await res.json()).toEqual({ ok: false, error: 'empty_source', source: 'parcel' });
  });

  it('a file under 50% of current rows is rejected and previous data stays', async () => {
    const sources = await standardSources(fx);
    await app.post({ force: false, sources });
    const lines = PARCEL_CSV.split('\r\n');
    fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': lines.slice(0, 2).join('\r\n') }), etag: '"small"' });
    const res = await app.post({ force: false, sources });
    expect(await res.json()).toEqual({ ok: false, error: 'row_count_drop', source: 'parcel' });
    expect(await count('kc_parcels')).toBe(3);
  });

  it('stops at the first failed source but keeps earlier swaps', async () => {
    const sources = await standardSources(fx);
    fx.set('/resbldg.zip', { body: Buffer.from('not a zip'), etag: '"bad"' });
    const res = await app.post({ force: false, sources });
    expect(res.status).toBe(422);
    expect(await count('kc_parcels')).toBe(3); // parcel ran first and committed
    expect(await count('kc_sales')).toBe(0);
  });

  it('addresses updates lat/lon/address/zip by pin and survives a parcel reload', async () => {
    const sources = await standardSources(fx);
    fx.set('/addr.csv', { body: Buffer.from(ADDRESS_CSV), etag: '"a1"' });
    const all = [...sources, { name: 'addresses', url: fx.url('/addr.csv') }];
    const body = await (await app.post({ force: false, sources: all })).json();
    expect(body.changed).toEqual(['parcel', 'resbldg', 'sales', 'addresses', 'lookup']);
    expect(body.rows.addresses).toBe(2); // the 3rd pin matches no parcel
    const [p] = await sql`select address, zip, lat, lon from kc_parcels where pin = '0012340056'`;
    expect(p).toEqual({ address: '123 MAIN ST', zip: '98116', lat: 47.5811, lon: -122.4001 });

    fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': PARCEL_CSV }), etag: '"p2"' });
    await app.post({ force: false, sources: all });
    const [q] = await sql`select lat, lon from kc_parcels where pin = '0012340056'`;
    expect(q).toEqual({ lat: 47.5811, lon: -122.4001 });
  });

  it('addresses accepts a zip with one csv, and fails on missing columns', async () => {
    const sources = await standardSources(fx);
    await app.post({ force: false, sources });
    fx.set('/addr.zip', { body: await zipOf({ 'parcel_points.csv': ADDRESS_CSV }), etag: '"a1"' });
    const ok = await (await app.post({ force: false, sources: [{ name: 'addresses', url: fx.url('/addr.zip') }] })).json();
    expect(ok).toMatchObject({ ok: true, changed: ['addresses'] });
    fx.set('/addr.zip', { body: await zipOf({ 'p.csv': 'PIN,LATITUDE\n1,2' }), etag: '"a2"' });
    const bad = await app.post({ force: false, sources: [{ name: 'addresses', url: fx.url('/addr.zip') }] });
    expect(await bad.json()).toEqual({ ok: false, error: 'missing_columns', source: 'addresses' });
  });

  it('decodes latin1 text', async () => {
    const csv = ['Major,Minor,BldgNbr,NbrLivingUnits,Address,ZipCode,Stories,BldgGrade,SqFtTotLiving,SqFtTotBasement,SqFtFinBasement,Bedrooms,BathFullCount,Bath3qtrCount,BathHalfCount,YrBuilt,YrRenovated,Condition', '1,1,1,1,"CAF\xc9 ST",98101,1,7,1000,0,0,2,1,0,0,1990,0,3'].join('\n');
    fx.set('/r.zip', { body: await zipOf({ 'EXTR_ResBldg.csv': Buffer.from(csv, 'latin1') }), etag: '"l"' });
    await app.post({ force: true, sources: [{ name: 'resbldg', url: fx.url('/r.zip') }] });
    const [r] = await sql`select address from kc_res_buildings`;
    expect(r!.address).toBe('CAFÉ ST');
  });

  it('rejects unknown and duplicate sources with 400', async () => {
    const r1 = await app.post({ force: false, sources: [{ name: 'bogus', url: fx.url('/x') }] });
    expect(r1.status).toBe(400);
    expect(await r1.json()).toEqual({ ok: false, error: 'unknown_source', source: 'bogus' });
    const r2 = await app.post({ force: false, sources: [{ name: 'lookup', url: fx.url('/x') }, { name: 'lookup', url: fx.url('/x') }] });
    expect(r2.status).toBe(400);
    expect((await app.post({ sources: [] })).status).toBe(400);
  });

  it('missing upstream (404) fails as download_failed', async () => {
    const res = await app.post({ force: false, sources: [{ name: 'parcel', url: fx.url('/nope.zip') }] });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'download_failed', source: 'parcel' });
  });
});

describe('auth, health, locking', () => {
  it('401 without or with a wrong token, and does no work', async () => {
    const sources = await standardSources(fx);
    expect((await app.post({ force: false, sources }, null)).status).toBe(401);
    expect((await app.post({ force: false, sources }, 'wrong')).status).toBe(401);
    expect((await app.post({ force: false, sources }, TOKEN + 'x')).status).toBe(401);
    expect(fx.hits).toHaveLength(0);
    expect(await count('kc_parcels')).toBe(0);
  });

  it('GET /healthz is 200 without auth', async () => {
    const res = await fetch(`${app.base}/healthz`);
    expect(res.status).toBe(200);
  });

  it('a concurrent call gets 409 busy', async () => {
    const sources = await standardSources(fx);
    fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': PARCEL_CSV }), etag: '"slow"', delayMs: 600 });
    const first = app.post({ force: false, sources: sources.filter((s) => s.name === 'parcel') });
    await new Promise((r) => setTimeout(r, 150));
    const second = await app.post({ force: false, sources: sources.filter((s) => s.name === 'lookup') });
    expect(second.status).toBe(409);
    expect(await second.json()).toEqual({ ok: false, error: 'busy' });
    expect((await first).status).toBe(200);
    // lock released afterwards
    expect((await app.post({ force: false, sources })).status).toBe(200);
  });

  it('another process holding the advisory lock gives 409 and releases nothing of ours', async () => {
    const other = await sql.reserve();
    await other`select pg_advisory_lock(${ADVISORY_LOCK_KEY})`;
    try {
      const sources = await standardSources(fx);
      const out = await runIngest(deps(sql), { force: false, sources });
      expect(out).toEqual({ status: 409, body: { ok: false, error: 'busy' } });
    } finally {
      await other`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`;
      other.release();
    }
    const sources = await standardSources(fx);
    expect((await runIngest(deps(sql), { force: false, sources })).status).toBe(200);
  });
});
