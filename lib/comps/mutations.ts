import 'server-only';

// Comps mutations and reads on saved sets. Plain functions over a `tx` from withUser(), so RLS
// applies to every statement. A deal the caller cannot see behaves as "not found".

import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/lib/db/rls';
import { compSets, deals } from '@/lib/db/schema';
import { parcelExists } from './query';

export const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{10}$/, 'The parcel PIN is 10 digits.');

/** Save the deal's parcel PIN. The PIN must exist in the county data. */
export async function setDealParcelPin(tx: Tx, dealId: string, rawPin: unknown): Promise<void> {
  const pin = pinSchema.parse(rawPin);
  if (!(await parcelExists(tx, pin))) throw new Error('parcel not found');
  const res = await tx.update(deals).set({ parcelPin: pin }).where(eq(deals.id, dealId)).returning({ id: deals.id });
  if (res.length === 0) throw new Error('deal not found');
}

export async function saveCompSet(tx: Tx, dealId: string, params: unknown, results: unknown): Promise<string> {
  const [deal] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error('deal not found');
  const [row] = await tx
    .insert(compSets)
    .values({ dealId, params: params as object, results: results as object })
    .returning({ id: compSets.id });
  return row!.id;
}

export async function listCompSets(tx: Tx, dealId: string) {
  return tx.select().from(compSets).where(eq(compSets.dealId, dealId)).orderBy(desc(compSets.createdAt));
}
