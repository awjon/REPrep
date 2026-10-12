// Materializes the deadline engine's output into deal_dates for one deal.
// Engine-managed rows are keyed (deal_id, kind); rows the user pinned to an exact date
// (is_overridden) and custom rows are never touched by a sync.

import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { computeDealSchedule, pacificTimeToUtc } from '@/lib/deadlines/compute';
import { DEADLINE_HOUR, type DefaultKind } from '@/lib/deadlines/rules/wa-defaults';
import type { Tx } from '@/lib/db/rls';
import { dealDates, deals } from '@/lib/db/schema';

type ManagedKind = DefaultKind | 'closing' | 'possession';
const MANAGED: ManagedKind[] = ['earnest_money', 'form17_review', 'inspection', 'financing', 'closing', 'possession'];

export async function syncDealDates(tx: Tx, dealId: string): Promise<void> {
  const [deal] = await tx.select().from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error('deal not found');

  const schedule = deal.mutualAcceptanceAt
    ? computeDealSchedule({
        mutualAcceptanceAt: deal.mutualAcceptanceAt,
        form17ReceivedOn: deal.form17ReceivedOn ?? undefined,
        closingDate: deal.closingDate ?? undefined,
        possessionDaysAfterClosing: deal.possessionDaysAfterClosing,
        overrides: deal.periodOverrides as Partial<Record<DefaultKind, number | null>>,
      })
    : [];

  for (const item of schedule) {
    await tx
      .insert(dealDates)
      .values({ dealId, kind: item.kind, label: item.label, periodDays: item.periodDays, dueAt: item.dueAt })
      .onConflictDoUpdate({
        target: [dealDates.dealId, dealDates.kind],
        targetWhere: sql`kind <> 'custom'`,
        set: { label: item.label, periodDays: item.periodDays, dueAt: item.dueAt, updatedAt: new Date() },
        setWhere: sql`${dealDates.isOverridden} = false`,
      });
  }

  // Remove engine rows the schedule no longer produces, unless the user pinned them.
  const keep = schedule.map((s) => s.kind);
  await tx
    .delete(dealDates)
    .where(
      and(
        eq(dealDates.dealId, dealId),
        inArray(dealDates.kind, MANAGED),
        eq(dealDates.isOverridden, false),
        keep.length ? notInArray(dealDates.kind, keep) : ne(dealDates.kind, 'custom'),
      ),
    );
}

/** Pin a deadline to a specific date (9:00 pm Pacific) taken from the user's contract. */
export async function setExactDate(tx: Tx, dealDateId: string, date: string): Promise<void> {
  const res = await tx
    .update(dealDates)
    .set({ dueAt: pacificTimeToUtc(date, DEADLINE_HOUR), isOverridden: true, updatedAt: new Date() })
    .where(eq(dealDates.id, dealDateId))
    .returning({ id: dealDates.id });
  if (res.length === 0) throw new Error('deadline not found');
}

/** Unpin; the next sync recomputes it. */
export async function clearExactDate(tx: Tx, dealDateId: string): Promise<void> {
  await tx.update(dealDates).set({ isOverridden: false }).where(eq(dealDates.id, dealDateId));
}
