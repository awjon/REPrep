// Pure row mappers and normalizers. No I/O. Real files are latin1, quoted, padded with
// whitespace and use empty strings for missing numbers, so every field goes through here.
import type { AddressColumns, SourceName } from './sources.js';

export type Rec = Record<string, string | undefined>;

export function clean(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
}

const INT_RE = /^[+-]?\d+(\.0+)?$/;

/** Integer or null. Tolerates "12", " 12 ", "12.0", "1,234"; rejects junk and values outside int4. */
export function toInt(v: string | undefined | null): number | null {
  const t = clean(v)?.replace(/,/g, '');
  if (t == null || !INT_RE.test(t)) return null;
  const n = Number(t.replace(/\.0+$/, ''));
  if (!Number.isSafeInteger(n) || n > 2_147_483_647 || n < -2_147_483_648) return null;
  return n;
}

export function toFloat(v: string | undefined | null): number | null {
  const t = clean(v);
  if (t == null || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** numeric(3,1) for stories: one decimal, |x| < 100. Returned as a string for the driver. */
export function toStories(v: string | undefined | null): string | null {
  const n = toFloat(v);
  if (n == null || Math.abs(n) >= 100) return null;
  return n.toFixed(1);
}

/** PIN = Major zero-padded to 6 + Minor zero-padded to 4. */
export function makePin(major: string | undefined | null, minor: string | undefined | null): string | null {
  const a = clean(major);
  const b = clean(minor);
  if (a == null || b == null || !/^\d{1,6}$/.test(a) || !/^\d{1,4}$/.test(b)) return null;
  return a.padStart(6, '0') + b.padStart(4, '0');
}

/** A PIN column from another publisher: strip separators, restore lost leading zeros. */
export function normalizePin(v: string | undefined | null): string | null {
  const t = clean(v)?.replace(/[\s-]/g, '');
  if (t == null || !/^\d{1,10}(\.0+)?$/.test(t)) return null;
  return t.replace(/\.0+$/, '').padStart(10, '0');
}

/** MM/DD/YYYY (optionally followed by a time) or YYYY-MM-DD -> YYYY-MM-DD, validated as a real date. */
export function parseDate(v: string | undefined | null): string | null {
  const t = clean(v);
  if (t == null) return null;
  let y: number, m: number, d: number;
  let mt = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T].*)?$/.exec(t);
  if (mt) {
    m = Number(mt[1]); d = Number(mt[2]); y = Number(mt[3]);
  } else if ((mt = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(t))) {
    y = Number(mt[1]); m = Number(mt[2]); d = Number(mt[3]);
  } else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Normalized uppercase street address with collapsed whitespace. */
export function normAddress(v: string | undefined | null): string | null {
  return clean(v)?.toUpperCase() ?? null;
}

export function normZip(v: string | undefined | null): string | null {
  const t = clean(v);
  if (t == null) return null;
  const m = /^(\d{5})(?:-?\d{4})?$/.exec(t);
  return m ? m[1]! : null;
}

// ---------- row shapes (keys are DB column names) ----------

export interface ParcelRow {
  pin: string; area: number | null; sub_area: number | null; prop_type: string | null;
  present_use: number | null; sq_ft_lot: number | null; current_zoning: string | null; district_name: string | null;
}
export interface ResBldgRow {
  pin: string; bldg_nbr: number; address: string | null; zip: string | null; nbr_living_units: number | null;
  stories: string | null; bldg_grade: number | null; sq_ft_tot_living: number | null; sq_ft_tot_basement: number | null;
  sq_ft_fin_basement: number | null; bedrooms: number | null; bath_full: number | null; bath_3qtr: number | null;
  bath_half: number | null; yr_built: number | null; yr_renovated: number | null; condition: number | null;
}
export interface SaleRow {
  excise_tax_nbr: string; pin: string; document_date: string; sale_price: number; property_type: number | null;
  principal_use: number | null; sale_instrument: number | null; sale_reason: number | null;
  property_class: number | null; sale_warning: string | null;
}
export interface AddressRow { pin: string; address: string | null; zip: string | null; lat: number; lon: number }

/** Returns null for rows that must be dropped (no usable key). */
export function mapParcel(r: Rec): ParcelRow | null {
  const pin = makePin(r.Major, r.Minor);
  if (!pin) return null;
  return {
    pin,
    area: toInt(r.Area),
    sub_area: toInt(r.SubArea),
    prop_type: clean(r.PropType),
    present_use: toInt(r.PresentUse),
    sq_ft_lot: toInt(r.SqFtLot),
    current_zoning: clean(r.CurrentZoning),
    district_name: clean(r.DistrictName),
  };
}

export function mapResBldg(r: Rec): ResBldgRow | null {
  const pin = makePin(r.Major, r.Minor);
  const bldg = toInt(r.BldgNbr);
  if (!pin || bldg == null) return null;
  return {
    pin,
    bldg_nbr: bldg,
    address: normAddress(r.Address),
    zip: normZip(r.ZipCode),
    nbr_living_units: toInt(r.NbrLivingUnits),
    stories: toStories(r.Stories),
    bldg_grade: toInt(r.BldgGrade),
    sq_ft_tot_living: toInt(r.SqFtTotLiving),
    sq_ft_tot_basement: toInt(r.SqFtTotBasement),
    sq_ft_fin_basement: toInt(r.SqFtFinBasement),
    bedrooms: toInt(r.Bedrooms),
    bath_full: toInt(r.BathFullCount),
    bath_3qtr: toInt(r.Bath3qtrCount),
    bath_half: toInt(r.BathHalfCount),
    yr_built: toInt(r.YrBuilt),
    yr_renovated: toInt(r.YrRenovated),
    condition: toInt(r.Condition),
  };
}

/** Sales filter: SalePrice > 0 and DocumentDate >= since (YYYY-MM-DD). */
export function mapSale(r: Rec, since: string): SaleRow | null {
  const pin = makePin(r.Major, r.Minor);
  const excise = clean(r.ExciseTaxNbr);
  const date = parseDate(r.DocumentDate);
  const price = toInt(r.SalePrice);
  if (!pin || !excise || !date || price == null || price <= 0 || date < since) return null;
  return {
    excise_tax_nbr: excise,
    pin,
    document_date: date,
    sale_price: price,
    property_type: toInt(r.PropertyType),
    principal_use: toInt(r.PrincipalUse),
    sale_instrument: toInt(r.SaleInstrument),
    sale_reason: toInt(r.SaleReason),
    property_class: toInt(r.PropertyClass),
    sale_warning: clean(r.SaleWarning),
  };
}

export function mapAddress(r: Rec, c: AddressColumns): AddressRow | null {
  const pin = normalizePin(r[c.pin]);
  const lat = toFloat(r[c.lat]);
  const lon = toFloat(r[c.lon]);
  if (!pin || lat == null || lon == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return null;
  return { pin, address: normAddress(r[c.address]), zip: normZip(r[c.zip]), lat, lon };
}

/** Returns the required headers missing from `header` (case-insensitive, trimmed). */
export function missingColumns(header: string[], required: string[]): string[] {
  const have = new Set(header.map((h) => h.trim().toLowerCase()));
  return required.filter((c) => !have.has(c.toLowerCase()));
}

export type { SourceName };
