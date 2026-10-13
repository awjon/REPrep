export type CompLocation = { kind: 'area' } | { kind: 'radius'; miles: number };

export type CompParams = {
  months: 6 | 12 | 24;
  /** Living-area band, percent either side of the subject (15 | 25 | 40). */
  sqftPct: 15 | 25 | 40;
  location: CompLocation;
  /** Year-built window in years either side of the subject; null = not applied. */
  yearWindow: number | null;
  /** Bedrooms within +/-1 of the subject. */
  sameBeds: boolean;
};

export type Subject = {
  pin: string;
  address: string | null;
  zip: string | null;
  area: number | null;
  subArea: number | null;
  lat: number | null;
  lon: number | null;
  sqFtLot: number | null;
  presentUse: number | null;
  sqFtLiving: number | null;
  bedrooms: number | null;
  /** Full + 0.75 per three-quarter + 0.5 per half. */
  baths: number | null;
  yrBuilt: number | null;
  grade: number | null;
  livingUnits: number | null;
};

export type CompRow = {
  exciseTaxNbr: string;
  pin: string;
  documentDate: string; // YYYY-MM-DD
  salePrice: number;
  address: string | null;
  sqFtLiving: number;
  bedrooms: number | null;
  baths: number | null;
  yrBuilt: number | null;
  sqFtLot: number | null;
  distanceMiles: number | null;
};

export type ParcelHit = { pin: string; address: string | null; zip: string | null };
