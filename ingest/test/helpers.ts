import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import postgres from 'postgres';
import yazl from 'yazl';
import { createApp } from '../src/server.js';
import type { LoadConfig } from '../src/load.js';
import type { RunDeps } from '../src/run.js';
import { addressColumns } from '../src/sources.js';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
export const TOKEN = 'test-token-0123456789abcdef0123456789';

export function connect() {
  return postgres(TEST_DATABASE_URL, { max: 4, onnotice: () => {} });
}

export async function resetTables(sql: postgres.Sql) {
  await sql`truncate kc_parcels, kc_res_buildings, kc_sales, ingest_runs`;
}

export function zipOf(files: Record<string, string | Buffer>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const z = new yazl.ZipFile();
    for (const [name, data] of Object.entries(files)) z.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data, 'latin1'), name);
    z.end();
    const chunks: Buffer[] = [];
    z.outputStream.on('data', (c: Buffer) => chunks.push(c));
    z.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    z.outputStream.on('error', reject);
  });
}

export interface Served {
  body: Buffer;
  etag?: string;
  lastModified?: string;
  delayMs?: number;
  headStatus?: number; // e.g. 405 to force the GET fallback
  declaredLength?: number; // lie about content-length (short body)
  status?: number;
}

export interface Fixture {
  url: (path: string) => string;
  set: (path: string, s: Served) => void;
  hits: { method: string; path: string }[];
  close: () => Promise<void>;
}

export async function fixtureServer(): Promise<Fixture> {
  const files = new Map<string, Served>();
  const hits: { method: string; path: string }[] = [];
  const server: Server = createServer((req, res) => {
    const path = req.url ?? '';
    hits.push({ method: req.method ?? '', path });
    const f = files.get(path);
    if (!f) return void res.writeHead(404).end();
    if (req.method === 'HEAD' && f.headStatus) return void res.writeHead(f.headStatus).end();
    const headers: Record<string, string | number> = { 'content-length': f.declaredLength ?? f.body.length };
    if (f.etag) headers.etag = f.etag;
    if (f.lastModified) headers['last-modified'] = f.lastModified;
    const go = () => {
      res.writeHead(f.status ?? 200, headers);
      if (req.method === 'HEAD') return void res.end();
      if (f.declaredLength) return void res.write(f.body, () => setTimeout(() => res.destroy(), 20)); // short body: hang up
      res.end(f.body);
    };
    f.delayMs ? setTimeout(go, f.delayMs) : go();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: (p) => `http://127.0.0.1:${port}${p}`,
    set: (p, s) => void files.set(p, s),
    hits,
    close: () => new Promise((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}

export const config: LoadConfig = { salesSince: '2015-01-01', encoding: 'latin1', addressColumns: addressColumns({}) };

export function deps(sql: postgres.Sql): RunDeps {
  return { sql, fetch, config };
}

export async function appServer(sql: postgres.Sql) {
  const server = createApp(deps(sql), TOKEN);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    post: (body: unknown, token: string | null = TOKEN) =>
      fetch(`${base}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      }),
    close: () => new Promise<void>((r) => (server.closeAllConnections(), server.close(() => r()))),
  };
}

// ---------- CSV fixtures ----------

export const PARCEL_CSV = [
  'Major,Minor,PropName,Area,SubArea,PropType,PresentUse,SqFtLot,CurrentZoning,DistrictName',
  '"  1234 ","56","x",15,"3","R",2,5000,"NR3","SEATTLE"',
  '000001,0001,y,15,,R,2,,,SEATTLE',
  '5,7,z,8,1,C,0,12000.0,"C1-65 ",KENT',
].join('\r\n');

export const RESBLDG_CSV = [
  'Major,Minor,BldgNbr,NbrLivingUnits,Address,ZipCode,Stories,BldgGrade,SqFtTotLiving,SqFtTotBasement,SqFtFinBasement,Bedrooms,BathFullCount,Bath3qtrCount,BathHalfCount,YrBuilt,YrRenovated,Condition',
  '1234,56,1,1,"123  main st ",98116-1234,1.5,7,1800,400,200,3,1,1,1,1925,0,3',
  '1,1,1,1,"9 Oak Ave",98101,2,8,2500,,,4,2,0,1,1999,,4',
  '5,7,1,1,,,,,,,,,,,,,,',
].join('\n');

export const SALES_CSV = [
  'ExciseTaxNbr,Major,Minor,DocumentDate,SalePrice,RecordingNbr,Volume,Page,PlatNbr,PlatType,PlatLot,PlatBlock,SellerName,BuyerName,PropertyType,PrincipalUse,SaleInstrument,AFForestLand,AFCurrentUseLand,AFNonProfitUse,AFHistoricProperty,SaleReason,PropertyClass,SaleWarning',
  '3000001,1234,56,01/15/2020,850000,,,,,,,,,,2,6,3,N,N,N,N,1,8,',
  '3000002,1,1,03/02/2019,0,,,,,,,,,,2,6,3,N,N,N,N,1,8,',
  '3000003,5,7,12/31/2014,500000,,,,,,,,,,2,6,3,N,N,N,N,1,8,',
  '3000004,5,7,02/30/2021,500000,,,,,,,,,,2,6,3,N,N,N,N,1,8,',
  '3000005,5,7,06/01/2021,425000,,,,,,,,,,2,6,3,N,N,N,N,1,8," 11 15 "',
  '3000001,1234,56,01/15/2020,850000,,,,,,,,,,2,6,3,N,N,N,N,1,8,',
].join('\r\n');

export const ADDRESS_CSV = ['PIN,LAT,LON,ADDR_FULL,ZIP5', '0012340056,47.5811,-122.4001,"123 main st",98116', '0000010001,47.61,-122.33,9 Oak Ave,98101', '9999999999,47,-122,nowhere,98000'].join('\n');

export async function standardSources(fx: Fixture, etagSuffix = '1') {
  fx.set('/parcel.zip', { body: await zipOf({ 'EXTR_Parcel.csv': PARCEL_CSV }), etag: `"p${etagSuffix}"` });
  fx.set('/resbldg.zip', { body: await zipOf({ 'EXTR_ResBldg.csv': RESBLDG_CSV }), etag: `"r${etagSuffix}"` });
  fx.set('/sales.zip', { body: await zipOf({ 'EXTR_RPSale.csv': SALES_CSV, 'other.csv': 'a,b' }), etag: `"s${etagSuffix}"` });
  fx.set('/lookup.zip', { body: await zipOf({ 'EXTR_LookUp.csv': 'LUType,LUItem,LUDescription' }), lastModified: 'Mon, 01 Jan 2026 00:00:00 GMT' });
  return [
    { name: 'sales', url: fx.url('/sales.zip') },
    { name: 'parcel', url: fx.url('/parcel.zip') },
    { name: 'resbldg', url: fx.url('/resbldg.zip') },
    { name: 'lookup', url: fx.url('/lookup.zip') },
  ];
}
