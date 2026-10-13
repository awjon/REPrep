import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { currentStage, dueReminders, type ReminderCandidate } from '@/lib/deadlines/reminders';
import { dealDates, deals, reminderSends } from '@/lib/db/schema';
import { authUsers } from 'drizzle-orm/supabase';
import type { Db } from '@/lib/db/rls';
import { renderReminderEmail, type ReminderItem } from '@/lib/email/reminder-email';
import type { SendFn } from '@/lib/email/resend';

export type ReminderRunResult = {
  ok: true;
  due: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: { dealDateId: string; reason: string }[];
};

type Opts = { now: Date; lookaheadHours: number; dryRun: boolean; send: SendFn; appUrl: string };

const INACTIVE = new Set(['closed', 'terminated']);

export async function runReminders(db: Db, opts: Opts): Promise<ReminderRunResult> {
  const { now, lookaheadHours, dryRun, send, appUrl } = opts;
  const until = new Date(now.getTime() + lookaheadHours * 3_600_000);

  const rows = await db
    .select({
      dealDateId: dealDates.id,
      dealId: dealDates.dealId,
      userId: dealDates.userId,
      label: dealDates.label,
      dueAt: dealDates.dueAt,
      completedAt: dealDates.completedAt,
      dealStatus: deals.status,
      address: deals.address,
      email: authUsers.email,
    })
    .from(dealDates)
    .innerJoin(deals, and(eq(deals.id, dealDates.dealId), eq(deals.userId, dealDates.userId)))
    .innerJoin(authUsers, eq(authUsers.id, deals.userId))
    .where(and(isNull(dealDates.completedAt), gt(dealDates.dueAt, now), lte(dealDates.dueAt, until)));

  const sentRows = rows.length
    ? await db
        .select({ dealDateId: reminderSends.dealDateId, offsetKey: reminderSends.offsetKey })
        .from(reminderSends)
        .where(inArray(reminderSends.dealDateId, rows.map((r) => r.dealDateId)))
    : [];
  const sentBy = new Map<string, string[]>();
  for (const s of sentRows) sentBy.set(s.dealDateId, [...(sentBy.get(s.dealDateId) ?? []), s.offsetKey]);

  const candidates: (ReminderCandidate & (typeof rows)[number])[] = rows.map((r) => ({
    ...r,
    sentOffsets: sentBy.get(r.dealDateId) ?? [],
  }));

  const due = dueReminders(candidates, now);
  const byId = new Map(candidates.map((c) => [c.dealDateId, c]));
  // Items whose current stage already went out: still "due" for reporting, counted as skipped.
  const skipped = candidates.filter((c) => {
    if (c.completedAt || INACTIVE.has(c.dealStatus)) return false;
    const stage = currentStage(c.dueAt, now);
    return stage !== null && c.sentOffsets.includes(stage);
  }).length;
  const dueTotal = due.length + skipped;

  const result: ReminderRunResult = { ok: true, due: dueTotal, sent: 0, skipped, failed: 0, errors: [] };
  if (dryRun || due.length === 0) return result;

  const perUser = new Map<string, { dealDateId: string; offsetKey: string }[]>();
  for (const d of due) {
    const c = byId.get(d.dealDateId)!;
    perUser.set(c.userId, [...(perUser.get(c.userId) ?? []), d]);
  }

  for (const [userId, items] of perUser) {
    items.sort((a, b) => a.dealDateId.localeCompare(b.dealDateId)); // stable lock order across concurrent runs
    const first = byId.get(items[0]!.dealDateId)!;
    if (!first.email) {
      result.skipped += items.length; // nowhere to send; not claimed, so a later run can retry
      continue;
    }

    // Claim first: only rows we actually inserted are ours to send.
    const claimed = await db
      .insert(reminderSends)
      .values(items.map((i) => ({ userId, dealDateId: i.dealDateId, offsetKey: i.offsetKey })))
      .onConflictDoNothing()
      .returning({ id: reminderSends.id, dealDateId: reminderSends.dealDateId, offsetKey: reminderSends.offsetKey });
    result.skipped += items.length - claimed.length;
    if (claimed.length === 0) continue;

    const mail: ReminderItem[] = claimed.map((cl) => {
      const c = byId.get(cl.dealDateId)!;
      return { dealId: c.dealId, address: c.address, label: c.label, dueAt: c.dueAt };
    });
    const { subject, text, html } = renderReminderEmail(mail, appUrl);
    const claimIds = claimed.map((c) => c.id);

    let res: Awaited<ReturnType<SendFn>>;
    try {
      const idempotencyKey = `reminders/${claimed
        .map((c) => `${c.dealDateId}:${c.offsetKey}`)
        .sort()
        .join(',')}`.slice(0, 256);
      res = await send({ to: first.email, subject, text, html, idempotencyKey });
    } catch {
      res = { ok: false, reason: 'send_exception' };
    }

    if (res.ok) {
      await db.update(reminderSends).set({ providerMessageId: res.id }).where(inArray(reminderSends.id, claimIds));
      result.sent += claimed.length;
    } else {
      await db.delete(reminderSends).where(inArray(reminderSends.id, claimIds));
      result.failed += claimed.length;
      for (const cl of claimed) result.errors.push({ dealDateId: cl.dealDateId, reason: res.reason });
    }
  }
  return result;
}
