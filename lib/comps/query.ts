// Comps queries. All take a `tx` from withUser(), so the kc_* read-all RLS policies apply.
// Radius = bounding-box prefilter + haversine in SQL (no PostGIS needed).

import { asc, eq, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { kcParcels, kcResBuildings } from '@/lib/db/schema';
import { addressPatterns, MIN_SEARCH_LENGTH } from './address';
import { MAX_COMPS } from './codes';
import { bathsValue, monthsAgo } from './format';
import { boundingBox, EARTH_RADIUS_MILES } from './geo';
import { sqftBand } from './method';
import type { CompParams, CompRow, ParcelHit, Subject } from './types';

export const todayYmd = () => new Date().toISOString().slice(0, 10);

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

// ---------- parcel lookup ----------

export const isPin = (s: string) => /^\d{10}$/.test(s);

/** Parcels whose address (on the parcel or its residential building) matches; prefix matches first. */
export async function searchParcels(tx: Tx, input: string, limit = 20): Promise<ParcelHit[]> {
  const q = input.trim();
  if (q.length < MIN_SEARCH_LENGTH) return [];
  const { prefix, contains } = addressPatterns(q);
  const match = (col: SQL) =>
    sql.join([...contains.map((p) => sql`${col} like ${p}`)], sql` or `);
  const prefixMatch = (col: SQL) => sql.join(prefix.map((p) => sql`${col} like ${p}`), sql` or `);

  const rows = (await tx.execute(sql`
    select pin, address, zip, bool_or(is_prefix) as is_prefix from (
      select pin, address, zip, (${prefixMatch(sql`address`)}) as is_prefix
        from kc_parcels where address is not null and (${match(sql`address`)})
      union all
      select pin, address, zip, (${prefixMatch(sql`address`)}) as is_prefix
        from kc_res_buildings where address is not null and (${match(sql`address`)})
    ) m
    group by pin, address, zip
    order by bool_or(is_prefix) desc, address asc, pin asc
    limit ${limit * 2}
  `)) as unknown as Row[];

  // The same PIN can appear with a parcel address and a slightly different building address.
  const seen = new Set<string>();
  const out: ParcelHit[] = [];
  for (const r of rows) {
    const pin = String(r.pin);
    if (seen.has(pin)) continue;
    seen.add(pin);
    out.push({ pin, address: str(r.address), zip: str(r.zip) });
    if (out.length >= limit) break;
  }
  return out;
}

export async function parcelExists(tx: Tx, pin: string): Promise<boolean> {
  const rows = await tx.select({ pin: kcParcels.pin }).from(kcParcels).where(eq(kcParcels.pin, pin)).limit(1);
  return rows.length > 0;
}

// ---------- subject ----------

/** Parcel + its first residential building. Null when the PIN is not in the county data. */
export async function getSubject(tx: Tx, pin: string): Promise<Subject | null> {
  const [p] = await tx.select().from(kcParcels).where(eq(kcParcels.pin, pin)).limit(1);
  if (!p) return null;
  const [b] = await tx
    .select()
    .from(kcResBuildings)
    .where(eq(kcResBuildings.pin, pin))
    .orderBy(asc(kcResBuildings.bldgNbr))
    .limit(1);
  return {
    pin,
    address: b?.address ?? p.address,
    zip: b?.zip ?? p.zip,
    area: p.area,
    subArea: p.subArea,
    lat: p.lat,
    lon: p.lon,
    sqFtLot: p.sqFtLot,
    presentUse: p.presentUse,
    sqFtLiving: b?.sqFtTotLiving ?? null,
    bedrooms: b?.bedrooms ?? null,
    baths: b ? bathsValue(b.bathFull, b.bath3qtr, b.bathHalf) : null,
    yrBuilt: b?.yrBuilt ?? null,
    grade: b?.bldgGrade ?? null,
    livingUnits: b?.nbrLivingUnits ?? null,
  };
}

export const hasLocation = (s: Subject) => s.lat !== null && s.lon !== null;

// ---------- comps ----------

export type CompsResult = {
  comps: CompRow[];
  /** Number of living units matched (the subject's, else 1). */
  units: number;
  /** True when a radius was requested but the subject has no coordinates, so area was used. */
  locationFellBack: boolean;
  /** Why no search ran, when it could not. */
  unavailable: string | null;
};

export async function findComps(tx: Tx, subject: Subject, params: CompParams, asOf = todayYmd()): Promise<CompsResult> {
  const units = subject.livingUnits ?? 1;
  const none = (unavailable: string, locationFellBack = false): CompsResult => ({
    comps: [],
    units,
    locationFellBack,
    unavailable,
  });
  if (!subject.sqFtLiving) return none("This home's living area is not in the county data, so comparable sales cannot be selected.");

  const useRadius = params.location.kind === 'radius' && hasLocation(subject);
  const locationFellBack = params.location.kind === 'radius' && !useRadius;
  if (!useRadius && (subject.area === null || subject.subArea === null)) {
    return none("This home's assessor area is not in the county data.", locationFellBack);
  }

  const since = monthsAgo(asOf, params.months);
  const band = sqftBand(subject.sqFtLiving, params.sqftPct);

  const distanceExpr =
    subject.lat !== null && subject.lon !== null
      ? sql`(${2 * EARTH_RADIUS_MILES} * asin(least(1, sqrt(
          power(sin(radians(p.lat - ${subject.lat}) / 2), 2)
          + cos(radians(${subject.lat})) * cos(radians(p.lat)) * power(sin(radians(p.lon - ${subject.lon}) / 2), 2)
        ))))`
      : sql`null::double precision`;

  const where: SQL[] = [
    sql`s.document_date >= ${since}::date`,
    sql`s.document_date <= ${asOf}::date`,
    sql`s.sale_price > 0`,
    // Any warning code = not treated as arm's-length (lib/comps/codes.ts).
    sql`coalesce(btrim(s.sale_warning), '') = ''`,
    // Multi-parcel sales: the same excise number recorded against another PIN.
    sql`not exists (select 1 from kc_sales m where m.excise_tax_nbr = s.excise_tax_nbr and m.pin <> s.pin)`,
    // Exactly one residential building on the parcel.
    sql`(select count(*) from kc_res_buildings x where x.pin = s.pin) = 1`,
    sql`b.nbr_living_units = ${units}`,
    sql`b.sq_ft_tot_living between ${band.min} and ${band.max}`,
    sql`s.pin <> ${subject.pin}`,
  ];

  if (useRadius && params.location.kind === 'radius' && subject.lat !== null && subject.lon !== null) {
    const box = boundingBox(subject.lat, subject.lon, params.location.miles);
    where.push(sql`p.lat between ${box.minLat} and ${box.maxLat}`);
    where.push(sql`p.lon between ${box.minLon} and ${box.maxLon}`);
    where.push(sql`${distanceExpr} <= ${params.location.miles}`);
  } else {
    where.push(sql`p.area = ${subject.area}`, sql`p.sub_area = ${subject.subArea}`);
  }

  if (params.yearWindow !== null && subject.yrBuilt) {
    where.push(sql`b.yr_built between ${subject.yrBuilt - params.yearWindow} and ${subject.yrBuilt + params.yearWindow}`);
  }
  if (params.sameBeds && subject.bedrooms !== null) {
    where.push(sql`b.bedrooms between ${subject.bedrooms - 1} and ${subject.bedrooms + 1}`);
  }

  const rows = (await tx.execute(sql`
    select s.excise_tax_nbr, s.pin, to_char(s.document_date, 'YYYY-MM-DD') as document_date, s.sale_price,
           coalesce(b.address, p.address) as address, b.sq_ft_tot_living, b.bedrooms,
           b.bath_full, b.bath_3qtr, b.bath_half, b.yr_built, p.sq_ft_lot,
           ${useRadius ? distanceExpr : sql`null::double precision`} as distance
    from kc_sales s
    join kc_parcels p on p.pin = s.pin
    join kc_res_buildings b on b.pin = s.pin
    where ${sql.join(where, sql` and `)}
    order by s.document_date desc, s.excise_tax_nbr asc, s.pin asc
    limit ${MAX_COMPS}
  `)) as unknown as Row[];

  const comps: CompRow[] = rows.map((r) => ({
    exciseTaxNbr: String(r.excise_tax_nbr),
    pin: String(r.pin),
    documentDate: String(r.document_date),
    salePrice: Number(r.sale_price),
    address: str(r.address),
    sqFtLiving: Number(r.sq_ft_tot_living),
    bedrooms: num(r.bedrooms),
    baths: bathsValue(num(r.bath_full), num(r.bath_3qtr), num(r.bath_half)),
    yrBuilt: num(r.yr_built),
    sqFtLot: num(r.sq_ft_lot),
    distanceMiles: num(r.distance),
  }));
  return { comps, units, locationFellBack, unavailable: null };
}
