import { describe, expect, it } from 'vitest';
import { findBanned } from '@/lib/legal/banned-phrases';
import { ecaFlags, lotFlags, SDCI_ADU_URL, SEATTLE_GIS_URL, type LotFacts } from '@/lib/lot/flags';

const base: LotFacts = {
  pin: '9800000001',
  zoning: 'NR3',
  district: 'SEATTLE',
  lotSqFt: 3950,
  presentUse: 2,
  lat: 47.58,
  lon: -122.4,
  buildings: [{ livingUnits: 1, livingSqFt: 1800, yearBuilt: 1948, stories: 1.5 }],
};
const texts = (f: LotFacts) => lotFlags(f).map((x) => x.text);

describe('lotFlags', () => {
  it('describes a Seattle parcel factually and links to official sources', () => {
    const flags = lotFlags(base);
    const t = flags.map((f) => f.text);
    expect(t).toContain('Zoning on record: NR3');
    expect(t).toContain('Lot area on record: 3,950 sq ft');
    expect(t).toContain('Year built on record: 1948');
    expect(t.join(' ')).not.toMatch(/outside the City of Seattle/);
    const zoning = flags.find((f) => f.id === 'zoning')!;
    expect(zoning.links?.map((l) => l.url)).toEqual([SDCI_ADU_URL, SEATTLE_GIS_URL]);
    expect(zoning.links![0]!.label).toBe("Seattle's ADU rules are published by SDCI");
    expect(flags.every((f) => f.tone === 'note' || f.tone === 'check')).toBe(true);
  });

  it('flags a parcel outside Seattle and adds no Seattle links', () => {
    const flags = lotFlags({ ...base, district: 'BURIEN' });
    expect(flags.map((f) => f.text)).toContain(
      'Parcel is outside the City of Seattle (district: BURIEN); city rules differ.',
    );
    expect(flags.find((f) => f.id === 'district')!.tone).toBe('check');
    expect(flags.some((f) => f.links)).toBe(false);
  });

  it('flags missing zoning, lot area, district and coordinates', () => {
    const t = texts({ ...base, zoning: ' ', district: null, lotSqFt: null, lat: null, buildings: [] });
    expect(t).toContain('No zoning recorded on the parcel.');
    expect(t).toContain('No lot area recorded on the parcel.');
    expect(t).toContain('No jurisdiction is recorded on the parcel.');
    expect(t).toContain('No residential building record found for this parcel.');
    expect(t.join(' ')).toMatch(/No coordinates on record/);
  });

  it('flags multiple living units and multiple building records', () => {
    const t = texts({
      ...base,
      buildings: [
        { livingUnits: 1, livingSqFt: 1200, yearBuilt: 1950, stories: 1 },
        { livingUnits: 1, livingSqFt: 600, yearBuilt: 2015, stories: 1 },
      ],
    });
    expect(t).toContain('Building record shows 2 living units.');
    expect(t).toContain('Parcel has 2 residential building records.');
    expect(t).toContain('Living area on record: 1,800 sq ft');
    expect(t).toContain('Year built on record: 1950');
  });

  it('never states whether an ADU is allowed or gives dimensional rules, and passes the copy lint', () => {
    const all = [
      ...lotFlags(base),
      ...lotFlags({ ...base, district: 'BURIEN', zoning: null }),
      ...ecaFlags({ status: 'not_configured' }),
      ...ecaFlags({ status: 'error' }),
      ...ecaFlags({ status: 'ok', layers: [{ name: 'Steep slope', present: true }, { name: 'Liquefaction', present: false }] }),
    ];
    for (const f of all) {
      expect(f.text).not.toMatch(/\b(allowed|permitted|feasible|eligible|qualif|can build|setback|height limit)/i);
      expect(findBanned(f.text)).toEqual([]);
      for (const l of f.links ?? []) expect(findBanned(l.label)).toEqual([]);
    }
  });
});

describe('ecaFlags', () => {
  it('not configured: says overlays were not checked and links to the GIS portal', () => {
    const [f] = ecaFlags({ status: 'not_configured' });
    expect(f!.text).toBe('Environmentally critical area overlays were not checked.');
    expect(f!.links![0]!.url).toBe(SEATTLE_GIS_URL);
  });
  it('error is a check flag', () => {
    expect(ecaFlags({ status: 'error' })[0]!.tone).toBe('check');
  });
  it('ok: present layers are check flags, absent ones are notes', () => {
    const flags = ecaFlags({
      status: 'ok',
      layers: [
        { name: 'Steep slope', present: true },
        { name: 'Liquefaction', present: false },
      ],
    });
    expect(flags[0]).toMatchObject({ tone: 'check' });
    expect(flags[0]!.text).toMatch(/^Steep slope:/);
    expect(flags[1]).toMatchObject({ tone: 'note' });
  });
});
