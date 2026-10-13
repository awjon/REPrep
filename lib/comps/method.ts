// Plain-English description of the filters used. Pure.

import { MAX_COMPS } from './codes';
import { int } from './format';
import type { CompParams, Subject } from './types';

export type SqftBand = { min: number; max: number };

export function sqftBand(subjectSqFt: number, pct: number): SqftBand {
  return { min: Math.ceil(subjectSqFt * (1 - pct / 100)), max: Math.floor(subjectSqFt * (1 + pct / 100)) };
}

export function methodString(params: CompParams, subject: Subject, units: number, locationFellBack = false): string {
  const parts: string[] = [];
  parts.push(`Recorded sales from the last ${params.months} months with a price above $0`);
  parts.push('sales with an assessor warning code and sales that cover more than one parcel are left out');
  parts.push(
    `parcels with a single residential building and ${units} living unit${units === 1 ? '' : 's'}`,
  );
  if (params.location.kind === 'radius' && !locationFellBack) {
    parts.push(`within ${params.location.miles} mile${params.location.miles === 1 ? '' : 's'} of this home`);
  } else {
    const where =
      subject.area !== null && subject.subArea !== null
        ? `area ${subject.area}, sub-area ${subject.subArea}`
        : 'the same area and sub-area';
    parts.push(`in the same assessor area and sub-area as this home (${where})`);
  }
  if (subject.sqFtLiving) {
    const b = sqftBand(subject.sqFtLiving, params.sqftPct);
    parts.push(`living area within ${params.sqftPct}% of ${int(subject.sqFtLiving)} sq ft (${int(b.min)} to ${int(b.max)})`);
  }
  if (params.yearWindow !== null && subject.yrBuilt) {
    parts.push(`built within ${params.yearWindow} years of ${subject.yrBuilt}`);
  }
  if (params.sameBeds && subject.bedrooms !== null) {
    parts.push(`bedrooms within 1 of ${subject.bedrooms}`);
  }
  parts.push(`the home itself is excluded; up to the ${MAX_COMPS} most recent sales are used`);
  return parts.join('; ') + '.';
}
