import { describe, expect, it } from 'vitest';
import {
  clean, makePin, mapAddress, mapParcel, mapResBldg, mapSale, missingColumns, normalizePin, parseDate, toFloat, toInt,
  toStories, normZip,
} from '../src/csv.js';
import { SPECS, addressColumns } from '../src/sources.js';

describe('normalizers', () => {
  it('clean trims, collapses whitespace, empty -> null', () => {
    expect(clean('  a   b ')).toBe('a b');
    expect(clean('   ')).toBeNull();
    expect(clean(undefined)).toBeNull();
  });
  it('toInt is safe', () => {
    expect(toInt(' 12 ')).toBe(12);
    expect(toInt('12.0')).toBe(12);
    expect(toInt('1,234')).toBe(1234);
    expect(toInt('')).toBeNull();
    expect(toInt('abc')).toBeNull();
    expect(toInt('12.5')).toBeNull();
    expect(toInt('3000000000')).toBeNull();
    expect(toInt('-4')).toBe(-4);
  });
  it('toFloat / toStories', () => {
    expect(toFloat('47.5')).toBe(47.5);
    expect(toFloat('x')).toBeNull();
    expect(toStories('1.5')).toBe('1.5');
    expect(toStories('2')).toBe('2.0');
    expect(toStories('150')).toBeNull();
    expect(toStories('')).toBeNull();
  });
  it('makePin pads Major to 6 and Minor to 4', () => {
    expect(makePin('1234', '56')).toBe('0012340056');
    expect(makePin(' 5 ', '7')).toBe('0000050007');
    expect(makePin('123456', '7890')).toBe('1234567890');
    expect(makePin('1234567', '1')).toBeNull();
    expect(makePin('', '1')).toBeNull();
    expect(makePin('ab', '1')).toBeNull();
  });
  it('normalizePin restores lost zeros and strips separators', () => {
    expect(normalizePin('12340056')).toBe('0012340056');
    expect(normalizePin('123456-0056')).toBe('1234560056');
    expect(normalizePin('1234560056.0')).toBe('1234560056');
    expect(normalizePin('12345678901')).toBeNull();
    expect(normalizePin('')).toBeNull();
  });
  it('parseDate accepts MM/DD/YYYY, rejects impossible dates', () => {
    expect(parseDate('01/15/2020')).toBe('2020-01-15');
    expect(parseDate('1/5/2020 12:00:00 AM')).toBe('2020-01-05');
    expect(parseDate('2020-03-04')).toBe('2020-03-04');
    expect(parseDate('02/30/2021')).toBeNull();
    expect(parseDate('13/01/2021')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('garbage')).toBeNull();
  });
  it('normZip keeps 5 digits', () => {
    expect(normZip('98116-1234')).toBe('98116');
    expect(normZip('981')).toBeNull();
  });
});

describe('row mappers', () => {
  it('mapParcel', () => {
    expect(mapParcel({ Major: '1234', Minor: '56', Area: '15', SubArea: '', PropType: ' R ', PresentUse: '2', SqFtLot: '5000', CurrentZoning: 'NR3', DistrictName: 'SEATTLE' })).toEqual({
      pin: '0012340056', area: 15, sub_area: null, prop_type: 'R', present_use: 2, sq_ft_lot: 5000, current_zoning: 'NR3', district_name: 'SEATTLE',
    });
    expect(mapParcel({ Major: '', Minor: '1' })).toBeNull();
  });
  it('mapResBldg uppercases address and needs BldgNbr', () => {
    const r = mapResBldg({ Major: '1', Minor: '1', BldgNbr: '2', Address: ' 9  oak ave', ZipCode: '98101-0001', Stories: '1.5', Bedrooms: '', BathFullCount: '2' });
    expect(r).toMatchObject({ pin: '0000010001', bldg_nbr: 2, address: '9 OAK AVE', zip: '98101', stories: '1.5', bedrooms: null, bath_full: 2 });
    expect(mapResBldg({ Major: '1', Minor: '1', BldgNbr: '' })).toBeNull();
  });
  const sale = { ExciseTaxNbr: ' 300 ', Major: '1', Minor: '1', DocumentDate: '01/15/2020', SalePrice: '850000', SaleWarning: ' 11 15 ' };
  it('mapSale keeps good rows', () => {
    expect(mapSale(sale, '2015-01-01')).toMatchObject({ excise_tax_nbr: '300', pin: '0000010001', document_date: '2020-01-15', sale_price: 850000, sale_warning: '11 15' });
  });
  it('mapSale filters: price <= 0, before since, bad date, missing excise', () => {
    expect(mapSale({ ...sale, SalePrice: '0' }, '2015-01-01')).toBeNull();
    expect(mapSale({ ...sale, SalePrice: '' }, '2015-01-01')).toBeNull();
    expect(mapSale({ ...sale, DocumentDate: '12/31/2014' }, '2015-01-01')).toBeNull();
    expect(mapSale({ ...sale, DocumentDate: '01/15/2020' }, '2021-01-01')).toBeNull();
    expect(mapSale({ ...sale, DocumentDate: '02/30/2020' }, '2015-01-01')).toBeNull();
    expect(mapSale({ ...sale, ExciseTaxNbr: '' }, '2015-01-01')).toBeNull();
    expect(mapSale({ ...sale, SalePrice: '99999999999' }, '2015-01-01')).toBeNull();
  });
  it('mapAddress uses the configured columns', () => {
    const c = addressColumns({});
    expect(mapAddress({ PIN: '1234000056', LAT: '47.5', LON: '-122.4', ADDR_FULL: '1 a st', ZIP5: '98116' }, c)).toEqual({ pin: '1234000056', address: '1 A ST', zip: '98116', lat: 47.5, lon: -122.4 });
    expect(mapAddress({ PIN: '1', LAT: '', LON: '-122' }, c)).toBeNull();
    expect(mapAddress({ PIN: '1', LAT: '0', LON: '0' }, c)).toBeNull();
    expect(mapAddress({ PIN: '1', LAT: '95', LON: '0' }, c)).toBeNull();
    const custom = addressColumns({ ADDRESS_COL_PIN: 'PARCEL', ADDRESS_COL_LAT: 'Y' });
    expect(mapAddress({ PARCEL: '2', Y: '47', LON: '-122' }, custom)?.pin).toBe('0000000002');
  });
});

describe('header validation', () => {
  it('reports missing columns case-insensitively', () => {
    expect(missingColumns(['major', ' MINOR '], ['Major', 'Minor', 'Area'])).toEqual(['Area']);
    expect(missingColumns(SPECS.sales.required(addressColumns({})), SPECS.sales.required(addressColumns({})))).toEqual([]);
  });
});
