// Summary sentences and the saved snapshot shape. Pure. Descriptive wording only.

import { int, usd } from './format';
import type { CompStats } from './stats';
import type { CompRow, Subject } from './types';

/** e.g. "Comparable recorded sales: 14. Price per living sq ft: median $612, middle half $571-$655." */
export function statsSentences(stats: CompStats, subjectSqFt: number | null): string[] {
  const out = [`Comparable recorded sales: ${stats.count}.`];
  if (stats.median !== null && stats.p25 !== null && stats.p75 !== null) {
    out.push(
      `Price per living sq ft: median ${usd(stats.median)}, middle half ${usd(stats.p25)}–${usd(stats.p75)}.`,
    );
  }
  if (stats.range && subjectSqFt) {
    out.push(
      `Applied to this home's ${int(subjectSqFt)} sq ft: ${usd(stats.range.low)}–${usd(stats.range.high)}.`,
    );
  } else if (stats.rangeNote) {
    out.push(stats.rangeNote);
  }
  return out;
}

export type CompSnapshot = {
  asOf: string;
  subjectPin: string;
  subjectSqFt: number | null;
  subjectAddress: string | null;
  method: string;
  stats: Pick<CompStats, 'count' | 'median' | 'p25' | 'p75' | 'range' | 'rangeNote'>;
  comps: CompRow[];
};

export function buildSnapshot(args: {
  asOf: string;
  subject: Subject;
  method: string;
  stats: CompStats;
  comps: CompRow[];
}): CompSnapshot {
  const { stats } = args;
  return {
    asOf: args.asOf,
    subjectPin: args.subject.pin,
    subjectSqFt: args.subject.sqFtLiving,
    subjectAddress: args.subject.address,
    method: args.method,
    stats: {
      count: stats.count,
      median: stats.median,
      p25: stats.p25,
      p75: stats.p75,
      range: stats.range,
      rangeNote: stats.rangeNote,
    },
    comps: args.comps,
  };
}

