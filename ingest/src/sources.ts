// Everything that describes the upstream files lives here: source names, the
// file expected inside each zip, the CSV headers we require, and the column
// mapping for the optional `addresses` file (publishers name these differently).

export const SOURCE_NAMES = ['parcel', 'resbldg', 'sales', 'addresses', 'lookup'] as const;
export type SourceName = (typeof SOURCE_NAMES)[number];

/** parcel -> resbldg -> sales -> addresses (addresses updates parcels, so it goes after parcel). */
export const RUN_ORDER: readonly SourceName[] = SOURCE_NAMES;

export function isSourceName(s: string): s is SourceName {
  return (SOURCE_NAMES as readonly string[]).includes(s);
}

/**
 * Column mapping for the `addresses` source. Edit the defaults here (or override with env
 * ADDRESS_COL_PIN / _LAT / _LON / _ADDRESS / _ZIP) when the publisher's header names differ.
 * The PIN column may hold a 10-digit PIN (zero padding is restored if it was lost).
 */
export interface AddressColumns {
  pin: string;
  lat: string;
  lon: string;
  address: string;
  zip: string;
}

export function addressColumns(env: NodeJS.ProcessEnv = process.env): AddressColumns {
  return {
    pin: env.ADDRESS_COL_PIN || 'PIN',
    lat: env.ADDRESS_COL_LAT || 'LAT',
    lon: env.ADDRESS_COL_LON || 'LON',
    address: env.ADDRESS_COL_ADDRESS || 'ADDR_FULL',
    zip: env.ADDRESS_COL_ZIP || 'ZIP5',
  };
}

export interface SourceSpec {
  name: SourceName;
  /** Name of the CSV inside the zip (case-insensitive). null = take the only/first .csv. */
  file: string | null;
  /** Headers that must be present (case-insensitive). Function form so addresses can be env-configurable. */
  required: (cols: AddressColumns) => string[];
  /** false = recorded in ingest_runs but nothing is downloaded or loaded. */
  loads: boolean;
}

export const SPECS: Record<SourceName, SourceSpec> = {
  parcel: {
    name: 'parcel',
    file: 'EXTR_Parcel.csv',
    required: () => ['Major', 'Minor', 'Area', 'SubArea', 'PropType', 'PresentUse', 'SqFtLot', 'CurrentZoning', 'DistrictName'],
    loads: true,
  },
  resbldg: {
    name: 'resbldg',
    file: 'EXTR_ResBldg.csv',
    required: () => [
      'Major', 'Minor', 'BldgNbr', 'NbrLivingUnits', 'Address', 'ZipCode', 'Stories', 'BldgGrade',
      'SqFtTotLiving', 'SqFtTotBasement', 'SqFtFinBasement', 'Bedrooms', 'BathFullCount',
      'Bath3qtrCount', 'BathHalfCount', 'YrBuilt', 'YrRenovated', 'Condition',
    ],
    loads: true,
  },
  sales: {
    name: 'sales',
    file: 'EXTR_RPSale.csv',
    required: () => [
      'ExciseTaxNbr', 'Major', 'Minor', 'DocumentDate', 'SalePrice', 'PropertyType', 'PrincipalUse',
      'SaleInstrument', 'SaleReason', 'PropertyClass', 'SaleWarning',
    ],
    loads: true,
  },
  addresses: {
    name: 'addresses',
    file: null,
    required: (c) => [c.pin, c.lat, c.lon, c.address, c.zip],
    loads: true,
  },
  lookup: { name: 'lookup', file: 'EXTR_LookUp.csv', required: () => [], loads: false },
};
