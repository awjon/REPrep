// Which reminders are due right now. Pure: the reminders job loads candidates, calls this,
// sends, and records each send in reminder_sends (unique per deadline + stage).

import { pacificDateOf, pacificTimeToUtc } from './compute';
import { DAY_OF_REMINDER_HOUR } from './rules/wa-defaults';

export type OffsetKey = '48h' | '24h' | 'day_of';

export type ReminderCandidate = {
  dealDateId: string;
  dueAt: Date;
  completedAt: Date | null;
  dealStatus: string;
  sentOffsets: string[];
};

export type DueReminder = { dealDateId: string; offsetKey: OffsetKey };

const HOUR = 3_600_000;
const INACTIVE = new Set(['closed', 'terminated']);

/**
 * The latest reminder stage whose time has arrived, or null if none yet or the deadline passed.
 * Earlier stages that were skipped (deadline entered late) are not sent retroactively.
 */
export function currentStage(dueAt: Date, now: Date): OffsetKey | null {
  if (now >= dueAt) return null;
  const stages: { key: OffsetKey; at: number }[] = [
    { key: '48h' as const, at: dueAt.getTime() - 48 * HOUR },
    { key: '24h' as const, at: dueAt.getTime() - 24 * HOUR },
    { key: 'day_of' as const, at: pacificTimeToUtc(pacificDateOf(dueAt), DAY_OF_REMINDER_HOUR).getTime() },
  ].sort((a, b) => a.at - b.at);
  let stage: OffsetKey | null = null;
  for (const s of stages) if (now.getTime() >= s.at) stage = s.key;
  return stage;
}

export function dueReminders(candidates: ReminderCandidate[], now: Date): DueReminder[] {
  const out: DueReminder[] = [];
  for (const c of candidates) {
    if (c.completedAt || INACTIVE.has(c.dealStatus)) continue;
    const stage = currentStage(c.dueAt, now);
    if (stage && !c.sentOffsets.includes(stage)) out.push({ dealDateId: c.dealDateId, offsetKey: stage });
  }
  return out;
}
