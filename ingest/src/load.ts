// Stream CSV -> staging table -> validate -> swap.
import { parse } from 'csv-parse';
import type { Readable } from 'node:stream';
import type postgres from 'postgres';
import { z } from 'zod';
import {
  mapAddress, mapParcel, mapResBldg, mapSale, missingColumns,
  type Rec,
} from './csv.js';
import { IngestError } from './errors.js';
import type { Meta } from './files.js';
import { SPECS, type AddressColumns, type SourceName } from './sources.js';

export type Conn = postgres.ReservedSql;

export interface LoadConfig {
  salesSince: string; // YYYY-MM-DD
  encoding: BufferEncoding; // KC extracts are latin1; override with CSV_ENCODING
  addressColumns: AddressColumns;
}

type LoadName = Exclude<SourceName, 'lookup'>;

interface TableDef {
  staging: string;
  /** Staging/target columns, in the row objects' key names. */
  cols: string[];
  /** SQL that creates the temp staging table. */
  create: string;
}

const DEFS: Record<LoadName, TableDef> = {
  parcel: {
    staging: 'staging_parcel',
    cols: ['pin', 'area', 'sub_area', 'prop_type', 'present_use', 'sq_ft_lot', 'current_zoning', 'district_name'],
    create: 'create temp table staging_parcel (like kc_parcels including defaults)',
  },
  resbldg: {
    staging: 'staging_resbldg',
    cols: [
      'pin', 'bldg_nbr', 'address', 'zip', 'nbr_living_units', 'stories', 'bldg_grade', 'sq_ft_tot_living',
      'sq_ft_tot_basement', 'sq_ft_fin_basement', 'bedrooms', 'bath_full', 'bath_3qtr', 'bath_half',
      'yr_built', 'yr_renovated', 'condition',
    ],
    create: 'create temp table staging_resbldg (like kc_res_buildings including defaults)',
  },
  sales: {
    staging: 'staging_sales',
    cols: [
      'excise_tax_nbr', 'pin', 'document_date', 'sale_price', 'property_type', 'principal_use',
      'sale_instrument', 'sale_reason', 'property_class', 'sale_warning',
    ],
    create: 'create temp table staging_sales (like kc_sales including defaults)',
  },
  addresses: {
    staging: 'staging_addresses',
    cols: ['pin', 'address', 'zip', 'lat', 'lon'],
    create:
      'create temp table staging_addresses (pin text not null, address text, zip text, lat double precision not null, lon double precision not null)',
  },
};

export function isLoadable(name: SourceName): name is LoadName {
  return name !== 'lookup';
}

function mapperFor(name: LoadName, cfg: LoadConfig): (r: Rec) => Record<string, unknown> | null {
  switch (name) {
    case 'parcel': return (r) => mapParcel(r) as Record<string, unknown> | null;
    case 'resbldg': return (r) => mapResBldg(r) as Record<string, unknown> | null;
    case 'sales': return (r) => mapSale(r, cfg.salesSince) as Record<string, unknown> | null;
    case 'addresses': return (r) => mapAddress(r, cfg.addressColumns) as Record<string, unknown> | null;
  }
}

export interface StageResult {
  staged: number;
  read: number;
  parseErrors: number;
}

/**
 * Parse `input` and insert mapped rows into the (already created) temp staging table in
 * multi-row INSERT batches. Memory is bounded by one batch.
 */
export async function stageSource(conn: Conn, name: LoadName, input: Readable, cfg: LoadConfig): Promise<StageResult> {
  const def = DEFS[name];
  const required = SPECS[name].required(cfg.addressColumns);
  const canon = new Map(required.map((c) => [c.toLowerCase(), c]));
  const map = mapperFor(name, cfg);
  let parseErrors = 0;

  const parser = parse({
    columns: (header: string[]) => {
      const missing = missingColumns(header, required);
      if (missing.length) throw new IngestError('missing_columns', 422, `${name}: ${missing.join(', ')}`);
      return header.map((h) => canon.get(h.trim().toLowerCase()) ?? (h.trim() || false));
    },
    bom: true,
    trim: true,
    encoding: cfg.encoding,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    skip_records_with_error: true,
    on_skip: () => {
      parseErrors++;
    },
  });
  input.on('error', (e) => parser.destroy(e));
  input.pipe(parser);

  const batchSize = Math.max(1, Math.floor(60_000 / def.cols.length)); // stay under 65535 bind params
  let batch: Record<string, unknown>[] = [];
  let staged = 0;
  let read = 0;
  const flush = async () => {
    if (!batch.length) return;
    await conn`insert into ${conn(def.staging)} ${conn(batch, ...def.cols)}`;
    staged += batch.length;
    batch = [];
  };

  try {
    for await (const rec of parser as AsyncIterable<Rec>) {
      read++;
      const row = map(rec);
      if (!row) continue;
      batch.push(row);
      if (batch.length >= batchSize) await flush();
    }
    await flush();
  } catch (e) {
    input.destroy();
    if (e instanceof IngestError) throw e;
    if (e instanceof Error && 'code' in e && typeof e.code === 'string' && e.code.startsWith('CSV_')) {
      throw new IngestError('invalid_file', 422, e.message);
    }
    // stream/inflate errors from a truncated or corrupt zip vs. database errors
    if (e instanceof Error && e.name === 'PostgresError') throw e;
    throw new IngestError('invalid_file', 422, (e as Error).message);
  }

  // A few bad quotes are tolerated; a mangled file is not.
  if (parseErrors > Math.max(10, read * 0.001)) {
    throw new IngestError('invalid_file', 422, `${parseErrors} unparseable records of ${read}`);
  }
  return { staged, read, parseErrors };
}

export async function createStaging(conn: Conn, name: LoadName): Promise<void> {
  await conn.unsafe(`drop table if exists ${DEFS[name].staging}`);
  await conn.unsafe(DEFS[name].create);
}

export async function dropStaging(conn: Conn, name: LoadName): Promise<void> {
  try {
    await conn.unsafe(`drop table if exists ${DEFS[name].staging}`);
  } catch {
    /* connection may be broken; it is discarded then */
  }
}

/** Rows a successful load would be replacing (for the sanity check). */
async function currentRows(conn: Conn, name: LoadName): Promise<number> {
  const q: Record<LoadName, string> = {
    parcel: 'select count(*)::int as n from kc_parcels',
    resbldg: 'select count(*)::int as n from kc_res_buildings',
    sales: 'select count(*)::int as n from kc_sales',
    addresses: 'select count(*)::int as n from kc_parcels where lat is not null',
  };
  const [r] = await conn.unsafe<{ n: number }[]>(q[name]);
  return r!.n;
}

/** Row count > 0 and not under 50% of what is there now (unless the table is empty). */
export async function validateStaged(conn: Conn, name: LoadName, staged: number): Promise<void> {
  const current = await currentRows(conn, name);
  const schema = z
    .object({ staged: z.number().int().min(1, 'empty_source') })
    .refine(() => current === 0 || staged >= current * 0.5, 'row_count_drop');
  const r = schema.safeParse({ staged });
  if (!r.success) {
    const code = r.error.issues[0]!.message;
    throw new IngestError(code, 422, `${name}: staged ${staged}, current ${current}`);
  }
}

/**
 * Swap staging into the target inside ONE transaction, and record the run in the same
 * transaction so ingest_runs never claims a load that rolled back.
 *
 * Strategy: DELETE + INSERT ... SELECT, not TRUNCATE. TRUNCATE takes an ACCESS EXCLUSIVE lock
 * that blocks every comps/lot query until commit (minutes for 2M sales rows), whereas DELETE
 * is MVCC: readers keep seeing the old rows until the commit. The cost is dead tuples, which
 * autovacuum reclaims. A failure at any point rolls back and leaves the previous data intact.
 *
 * Returns rows written.
 */
export async function swapSource(conn: Conn, name: LoadName, meta: Meta): Promise<number> {
  await conn.unsafe('begin');
  try {
    let rows = 0;
    switch (name) {
      case 'parcel': {
        // The addresses source owns address/zip/lat/lon; carry them across the reload.
        await conn.unsafe(
          `create temp table old_geo on commit drop as
             select pin, address, zip, lat, lon from kc_parcels
             where address is not null or zip is not null or lat is not null`,
        );
        await conn.unsafe('delete from kc_parcels');
        const r = await conn.unsafe(
          `insert into kc_parcels (pin, area, sub_area, prop_type, present_use, sq_ft_lot, current_zoning, district_name,
                                   address, zip, lat, lon)
           select distinct on (s.pin) s.pin, s.area, s.sub_area, s.prop_type, s.present_use, s.sq_ft_lot,
                  s.current_zoning, s.district_name, g.address, g.zip, g.lat, g.lon
           from staging_parcel s left join old_geo g on g.pin = s.pin
           order by s.pin`,
        );
        rows = r.count;
        break;
      }
      case 'resbldg': {
        await conn.unsafe('delete from kc_res_buildings');
        const cols = DEFS.resbldg.cols.join(', ');
        const r = await conn.unsafe(
          `insert into kc_res_buildings (${cols}) select distinct on (pin, bldg_nbr) ${cols}
           from staging_resbldg order by pin, bldg_nbr`,
        );
        rows = r.count;
        break;
      }
      case 'sales': {
        await conn.unsafe('delete from kc_sales');
        const cols = DEFS.sales.cols.join(', ');
        const r = await conn.unsafe(
          `insert into kc_sales (${cols}) select distinct on (excise_tax_nbr, pin) ${cols}
           from staging_sales order by excise_tax_nbr, pin, document_date desc`,
        );
        rows = r.count;
        break;
      }
      case 'addresses': {
        // Update-only: parcels absent from the file keep what they have; null fields never overwrite.
        const r = await conn.unsafe(
          `update kc_parcels p set
             address = coalesce(s.address, p.address), zip = coalesce(s.zip, p.zip), lat = s.lat, lon = s.lon
           from (select distinct on (pin) * from staging_addresses order by pin, address) s
           where p.pin = s.pin`,
        );
        rows = r.count;
        break;
      }
    }
    await recordRun(conn, name, meta, rows);
    await conn.unsafe('commit');
    return rows;
  } catch (e) {
    try {
      await conn.unsafe('rollback');
    } catch {
      /* ignore */
    }
    throw e;
  }
}

export async function recordRun(conn: Conn, source: SourceName, meta: Meta, rows: number): Promise<void> {
  await conn`insert into ingest_runs (source, etag, last_modified, rows)
             values (${source}, ${meta.etag}, ${meta.lastModified}, ${rows})`;
}

export async function lastRun(conn: Conn, source: SourceName): Promise<Meta | null> {
  const [r] = await conn<{ etag: string | null; last_modified: string | null }[]>`
    select etag, last_modified from ingest_runs where source = ${source}
    order by loaded_at desc, id desc limit 1`;
  return r ? { etag: r.etag, lastModified: r.last_modified } : null;
}
