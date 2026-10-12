// Display helpers for deals and deadlines. Pure; no I/O. All clock times are shown in Pacific time.

import { parseYmd } from '@/lib/deadlines/calendar';
import { pacificDateOf } from '@/lib/deadlines/compute';

export const DEAL_STATUSES = ['watching', 'offer_prep', 'under_contract', 'closed', 'terminated'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

const LABELS: Record<DealStatus, string> = {
  watching: 'Watching',
  offer_prep: 'Preparing an offer',
  under_contract: 'Under contract',
  closed: 'Closed',
  terminated: 'Terminated',
};

export const statusLabel = (s: DealStatus): string => LABELS[s];

const TZ = 'America/Los_Angeles';

const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const hmFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** e.g. "Mon, Oct 19" */
export const formatPacificDate = (d: Date): string => dayFmt.format(d);

/** e.g. "Mon, Oct 19 · 9:00 pm" */
export function formatPacific(d: Date): string {
  return `${dayFmt.format(d)} · ${timeFmt.format(d).replace(/\s?(AM|PM)$/, (_, p: string) => ` ${p.toLowerCase()}`)}`;
}

/** Pacific calendar date as a `<input type="date">` value. */
export const pacificDateInputValue = (d: Date): string => pacificDateOf(d);

/** Pacific wall-clock time as a `<input type="datetime-local">` value. */
export function pacificInputValue(d: Date): string {
  const parts = Object.fromEntries(hmFmt.formatToParts(d).map((p) => [p.type, p.value]));
  return `${pacificDateOf(d)}T${parts.hour}:${parts.minute}`;
}

const DAY_MS = 86_400_000;

/** "passed", "today", "tomorrow" or "in N days", counted by Pacific calendar date. */
export function relativeDue(due: Date, now: Date): string {
  if (due.getTime() < now.getTime()) return 'passed';
  const days = Math.round((parseYmd(pacificDateOf(due)).getTime() - parseYmd(pacificDateOf(now)).getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
export const formatPrice = (n: number | null | undefined): string => (n == null ? '' : usd.format(n));
