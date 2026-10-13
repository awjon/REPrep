import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '@/lib/db/rls';
import { deals } from '@/lib/db/schema';

/** King County PIN: 10 digits. Hyphens and spaces are tolerated and removed. */
export const pinSchema = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') : v),
  z.string().regex(/^\d{10}$/, 'The parcel PIN is 10 digits.'),
);

/** Saves the parcel PIN on a deal the caller owns (RLS hides other users' deals as "not found"). */
export async function setParcelPin(tx: Tx, dealId: string, raw: unknown): Promise<string> {
  const pin = pinSchema.parse(raw) as string;
  const res = await tx.update(deals).set({ parcelPin: pin }).where(eq(deals.id, dealId)).returning({ id: deals.id });
  if (res.length === 0) throw new Error('deal not found');
  return pin;
}
