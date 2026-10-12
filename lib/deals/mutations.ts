import 'server-only';

// Deal workspace mutations. Plain functions over a `tx` from withUser(), so RLS applies to every
// statement. Each takes raw (form-shaped) input and validates it with zod; Server Actions parse the
// same schemas first to show field errors. A row the caller cannot see behaves as "not found".

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseYmd } from '@/lib/deadlines/calendar';
import { pacificTimeToUtc } from '@/lib/deadlines/compute';
import { DEADLINE_HOUR, WA_DEFAULTS, type DefaultKind } from '@/lib/deadlines/rules/wa-defaults';
import type { Tx } from '@/lib/db/rls';
import { dealDates, deals } from '@/lib/db/schema';
import { DEAL_STATUSES } from './format';
import { clearExactDate, setExactDate, syncDealDates } from './schedule';

// ---------- schemas ----------

const blank = (v: unknown) => (v == null || (typeof v === 'string' && v.trim() === '') ? undefined : v);
const optional = <T extends z.ZodTypeAny>(s: T) => z.preprocess(blank, s.optional());

const validDate = z.string().trim().refine((s) => {
  try {
    parseYmd(s);
    return true;
  } catch {
    return false;
  }
}, 'Enter a valid date.');

const MAX_PRICE = 2_000_000_000; // column is a 32-bit integer

const price = z
  .string()
  .trim()
  .transform((s) => s.replace(/[$,\s]/g, ''))
  .pipe(z.string().regex(/^\d+$/, 'Enter whole dollars, for example 850000.'))
  .transform(Number)
  .pipe(z.number().max(MAX_PRICE, 'That price is too large.'));

export const dealFieldsSchema = z.object({
  address: z.string().trim().min(1, 'Enter the property address.').max(300, 'That address is too long.'),
  parcelPin: optional(z.string().trim().regex(/^\d{10}$/, 'The parcel PIN is 10 digits.')).transform((v) => v ?? null),
  listPrice: optional(price).transform((v) => v ?? null),
  notes: optional(z.string().trim().max(10_000, 'Notes are too long.')).transform((v) => v ?? null),
});

export const dealUpdateSchema = dealFieldsSchema.extend({
  status: z.enum(DEAL_STATUSES, { message: 'Choose a status.' }),
});

const days = (min: number) =>
  z.coerce
    .number({ message: `Enter a whole number of days, ${min} to 365.` })
    .int(`Enter a whole number of days, ${min} to 365.`)
    .min(min, `Enter a whole number of days, ${min} to 365.`)
    .max(365, `Enter a whole number of days, ${min} to 365.`);

const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

const acceptanceAt = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(s);
    try {
      if (!m) throw new Error('format');
      parseYmd(m[1]!);
      return pacificTimeToUtc(m[1]!, m[2]!); // datetime-local is Pacific wall time
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid date and time.' });
      return z.NEVER;
    }
  });

const periodKinds = WA_DEFAULTS.map((d) => d.kind) as DefaultKind[];

/** Flat, form-shaped input: `period_<kind>` (days) and `none_<kind>` (checkbox) per contingency. */
export const scheduleInputsSchema = z
  .object({
    acceptanceAt: optional(acceptanceAt),
    form17ReceivedOn: optional(validDate),
    closingDate: optional(validDate),
    possessionDays: optional(days(0)),
    period_earnest_money: optional(days(1)),
    period_form17_review: optional(days(1)),
    period_inspection: optional(days(1)),
    period_financing: optional(days(1)),
    none_earnest_money: checkbox,
    none_form17_review: checkbox,
    none_inspection: checkbox,
    none_financing: checkbox,
  })
  .transform((v) => {
    const periodOverrides: Record<string, number | null> = {};
    for (const kind of periodKinds) {
      if (v[`none_${kind}`]) periodOverrides[kind] = null;
      else if (v[`period_${kind}`] !== undefined) periodOverrides[kind] = v[`period_${kind}`] as number;
    }
    return {
      mutualAcceptanceAt: v.acceptanceAt ?? null,
      form17ReceivedOn: v.form17ReceivedOn ?? null,
      closingDate: v.closingDate ?? null,
      possessionDaysAfterClosing: v.possessionDays ?? 0,
      periodOverrides,
    };
  });

export const customDeadlineSchema = z.object({
  label: z.string().trim().min(1, 'Enter a label.').max(120, 'That label is too long.'),
  date: validDate,
});

export const exactDateSchema = z.object({ date: validDate });

/** First message per top-level field, for showing next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}

// ---------- mutations ----------

const notFound = (what: string) => new Error(`${what} not found`);

export async function createDeal(tx: Tx, raw: unknown): Promise<string> {
  const input = dealFieldsSchema.parse(raw);
  const [row] = await tx.insert(deals).values(input).returning({ id: deals.id });
  return row!.id;
}

export async function updateDeal(tx: Tx, dealId: string, raw: unknown): Promise<void> {
  const input = dealUpdateSchema.parse(raw);
  const res = await tx.update(deals).set(input).where(eq(deals.id, dealId)).returning({ id: deals.id });
  if (res.length === 0) throw notFound('deal');
}

/** Deadlines go with the deal (FK cascade). */
export async function deleteDeal(tx: Tx, dealId: string): Promise<void> {
  const res = await tx.delete(deals).where(eq(deals.id, dealId)).returning({ id: deals.id });
  if (res.length === 0) throw notFound('deal');
}

/** Saves the engine inputs, then rebuilds deal_dates in the same transaction. */
export async function saveScheduleInputs(tx: Tx, dealId: string, raw: unknown): Promise<void> {
  const input = scheduleInputsSchema.parse(raw);
  const res = await tx.update(deals).set(input).where(eq(deals.id, dealId)).returning({ id: deals.id });
  if (res.length === 0) throw notFound('deal');
  await syncDealDates(tx, dealId);
}

export async function setDealDateDone(tx: Tx, dealDateId: string, done: boolean): Promise<void> {
  const res = await tx
    .update(dealDates)
    .set({ completedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(eq(dealDates.id, dealDateId))
    .returning({ id: dealDates.id });
  if (res.length === 0) throw notFound('deadline');
}

/** Pin an engine deadline to the exact date in the user's contract. */
export async function pinDealDate(tx: Tx, dealDateId: string, date: string): Promise<void> {
  const { date: valid } = exactDateSchema.parse({ date });
  await setExactDate(tx, dealDateId, valid);
}

/** Drop the pin and recompute that deadline from the inputs. */
export async function restoreComputedDate(tx: Tx, dealDateId: string): Promise<void> {
  const [row] = await tx.select({ dealId: dealDates.dealId }).from(dealDates).where(eq(dealDates.id, dealDateId));
  if (!row) throw notFound('deadline');
  await clearExactDate(tx, dealDateId);
  await syncDealDates(tx, row.dealId);
}

export async function addCustomDeadline(tx: Tx, dealId: string, raw: unknown): Promise<string> {
  const input = customDeadlineSchema.parse(raw);
  const [deal] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
  if (!deal) throw notFound('deal');
  const [row] = await tx
    .insert(dealDates)
    .values({ dealId, kind: 'custom', label: input.label, dueAt: pacificTimeToUtc(input.date, DEADLINE_HOUR) })
    .returning({ id: dealDates.id });
  return row!.id;
}

export async function deleteCustomDeadline(tx: Tx, dealDateId: string): Promise<void> {
  const res = await tx
    .delete(dealDates)
    .where(and(eq(dealDates.id, dealDateId), eq(dealDates.kind, 'custom')))
    .returning({ id: dealDates.id });
  if (res.length === 0) throw notFound('deadline');
}
