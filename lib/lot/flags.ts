// Lot screen flags. Pure: facts in, flags out. A flag is a factual statement about the public
// record with a tone of `note` (informational) or `check` (worth looking at in the source).
// Flags never say whether an ADU/DADU is allowed or feasible and never state dimensional rules;
// they point to the official publishers instead (CLAUDE.md §3, §4 "Lot screen").

export const SDCI_ADU_URL = 'https://www.seattle.gov/sdci/permits/common-projects/accessory-dwelling-units';
export const SEATTLE_GIS_URL = 'https://www.seattle.gov/gis';

export type FlagTone = 'note' | 'check';
export type FlagLink = { label: string; url: string };
export type LotFlag = { id: string; tone: FlagTone; text: string; links?: FlagLink[] };

export type LotBuilding = {
  livingUnits: number | null;
  livingSqFt: number | null;
  yearBuilt: number | null;
  stories: number | null;
};

export type LotFacts = {
  pin: string;
  zoning: string | null;
  district: string | null;
  lotSqFt: number | null;
  presentUse: number | null;
  lat: number | null;
  lon: number | null;
  buildings: LotBuilding[];
};

export type EcaResult =
  | { status: 'not_configured' }
  | { status: 'ok'; layers: { name: string; present: boolean }[] }
  | { status: 'error' };

export const isSeattle = (district: string | null): boolean => (district ?? '').trim().toUpperCase() === 'SEATTLE';

const SDCI_LINK: FlagLink = { label: "Seattle's ADU rules are published by SDCI", url: SDCI_ADU_URL };
const GIS_LINK: FlagLink = { label: 'Seattle GIS map portal', url: SEATTLE_GIS_URL };

const num = new Intl.NumberFormat('en-US');
const blankToNull = (s: string | null) => (s && s.trim() !== '' ? s.trim() : null);

export function lotFlags(facts: LotFacts): LotFlag[] {
  const out: LotFlag[] = [];
  const district = blankToNull(facts.district);
  const seattle = isSeattle(district);
  const zoning = blankToNull(facts.zoning);

  if (district === null) {
    out.push({ id: 'district-missing', tone: 'check', text: 'No jurisdiction is recorded on the parcel.' });
  } else if (seattle) {
    out.push({ id: 'district', tone: 'note', text: 'Parcel is inside the City of Seattle (district: SEATTLE).' });
  } else {
    out.push({
      id: 'district',
      tone: 'check',
      text: `Parcel is outside the City of Seattle (district: ${district}); city rules differ.`,
    });
  }

  if (zoning === null) {
    out.push({
      id: 'zoning-missing',
      tone: 'check',
      text: 'No zoning recorded on the parcel.',
      links: seattle ? [GIS_LINK] : undefined,
    });
  } else {
    out.push({
      id: 'zoning',
      tone: 'note',
      text: `Zoning on record: ${zoning}`,
      links: seattle ? [SDCI_LINK, GIS_LINK] : undefined,
    });
  }

  if (facts.lotSqFt == null || facts.lotSqFt <= 0) {
    out.push({ id: 'lot-area-missing', tone: 'check', text: 'No lot area recorded on the parcel.' });
  } else {
    out.push({
      id: 'lot-area',
      tone: 'note',
      text: `Lot area on record: ${num.format(facts.lotSqFt)} sq ft`,
      links: seattle ? [SDCI_LINK] : undefined,
    });
  }

  if (facts.presentUse != null) {
    out.push({ id: 'present-use', tone: 'note', text: `Present use code on record: ${facts.presentUse}` });
  }

  if (facts.buildings.length === 0) {
    out.push({ id: 'no-building', tone: 'note', text: 'No residential building record found for this parcel.' });
  } else {
    if (facts.buildings.length > 1) {
      out.push({
        id: 'multi-building',
        tone: 'check',
        text: `Parcel has ${facts.buildings.length} residential building records.`,
      });
    }
    const units = facts.buildings.reduce((n, b) => n + (b.livingUnits ?? 0), 0);
    if (units > 1) {
      out.push({ id: 'multi-unit', tone: 'check', text: `Building record shows ${units} living units.` });
    }
    const living = facts.buildings.reduce((n, b) => n + (b.livingSqFt ?? 0), 0);
    if (living > 0) {
      out.push({ id: 'living-area', tone: 'note', text: `Living area on record: ${num.format(living)} sq ft` });
    }
    const years = facts.buildings.map((b) => b.yearBuilt).filter((y): y is number => y != null && y > 0);
    if (years.length > 0) {
      out.push({ id: 'year-built', tone: 'note', text: `Year built on record: ${Math.min(...years)}` });
    }
  }

  if (facts.lat == null || facts.lon == null) {
    out.push({
      id: 'no-coordinates',
      tone: 'check',
      text: 'No coordinates on record for this parcel, so map overlays cannot be looked up.',
    });
  }

  return out;
}

/** Turns an overlay lookup result into flags. Presence means the parcel's recorded point falls inside the layer. */
export function ecaFlags(result: EcaResult): LotFlag[] {
  if (result.status === 'not_configured') {
    return [
      {
        id: 'eca-not-checked',
        tone: 'note',
        text: 'Environmentally critical area overlays were not checked.',
        links: [GIS_LINK],
      },
    ];
  }
  if (result.status === 'error') {
    return [
      {
        id: 'eca-error',
        tone: 'check',
        text: 'Environmentally critical area overlays could not be checked just now. Try again later.',
        links: [GIS_LINK],
      },
    ];
  }
  const flags: LotFlag[] = result.layers.map((l, i) =>
    l.present
      ? { id: `eca-${i}`, tone: 'check' as const, text: `${l.name}: this mapped layer covers the parcel's recorded point.` }
      : { id: `eca-${i}`, tone: 'note' as const, text: `${l.name}: no overlap found at the parcel's recorded point.` },
  );
  flags.push({
    id: 'eca-point-note',
    tone: 'note',
    text: 'Overlay results use one recorded point, not the full parcel boundary. Check the parcel on the Seattle GIS map portal.',
    links: [GIS_LINK],
  });
  return flags;
}
