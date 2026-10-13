import 'server-only';

// One call that runs the whole comps pipeline for a subject, used by the page and the save action.

import { methodString } from './method';
import { findComps, todayYmd, type CompsResult } from './query';
import { computeStats, type CompStats } from './stats';
import { buildSnapshot, type CompSnapshot } from './summary';
import type { Tx } from '@/lib/db/rls';
import type { CompParams, Subject } from './types';

export type CompsReport = {
  result: CompsResult;
  stats: CompStats;
  method: string;
  snapshot: CompSnapshot;
};

export async function runComps(tx: Tx, subject: Subject, params: CompParams, asOf = todayYmd()): Promise<CompsReport> {
  const result = await findComps(tx, subject, params, asOf);
  const stats = computeStats(result.comps, subject.sqFtLiving);
  const method = methodString(params, subject, result.units, result.locationFellBack);
  const snapshot = buildSnapshot({ asOf, subject, method, stats, comps: result.comps });
  return { result, stats, method, snapshot };
}
