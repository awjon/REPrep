import 'server-only';

import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { schema, withUser } from '@/lib/db/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

/** One deal, or a 404 (also for another user's deal: RLS hides it). Deduped per request. */
export const getDeal = cache(async (userId: string, id: string) => {
  if (!isUuid(id)) notFound();
  const [deal] = await withUser(userId, (tx) => tx.select().from(schema.deals).where(eq(schema.deals.id, id)));
  if (!deal) notFound();
  return deal;
});

export async function listDealsWithNext(userId: string) {
  const now = new Date();
  return withUser(userId, async (tx) => {
    const deals = await tx.select().from(schema.deals).orderBy(desc(schema.deals.updatedAt));
    const upcoming = await tx
      .select({ dealId: schema.dealDates.dealId, label: schema.dealDates.label, dueAt: schema.dealDates.dueAt, kind: schema.dealDates.kind, isOverridden: schema.dealDates.isOverridden })
      .from(schema.dealDates)
      .where(and(isNull(schema.dealDates.completedAt), gte(schema.dealDates.dueAt, now)))
      .orderBy(asc(schema.dealDates.dueAt));
    const next = new Map<string, { label: string; dueAt: Date; kind: string; isOverridden: boolean }>();
    for (const u of upcoming) if (!next.has(u.dealId)) next.set(u.dealId, u);
    return deals.map((d) => ({ deal: d, next: next.get(d.id) ?? null }));
  });
}

export async function listDealDates(userId: string, dealId: string) {
  return withUser(userId, (tx) =>
    tx
      .select()
      .from(schema.dealDates)
      .where(eq(schema.dealDates.dealId, dealId))
      .orderBy(asc(schema.dealDates.dueAt)),
  );
}
