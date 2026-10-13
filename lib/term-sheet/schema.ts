// Term sheet data: a structured summary of terms the buyer is considering, for an attorney.
// It is not a contract or a form. Pure; no I/O. Two shapes:
//  - TermSheetData: what is stored in term_sheets.data and rendered to PDF
//  - the flat, form-shaped input parsed by parseTermSheetForm (all values are strings)

import { z } from 'zod';
import { parseYmd } from '@/lib/deadlines/calendar';

export const FINANCING_TYPES = ['cash', 'conventional', 'fha', 'va', 'other'] as const;
export type FinancingType = (typeof FINANCING_TYPES)[number];
export const FINANCING_LABELS: Record<FinancingType, string> = {
  cash: 'Cash',
  conventional: 'Conventional loan',
  fha: 'FHA loan',
  va: 'VA loan',
  other: 'Other',
};

export const MAX_MONEY = 2_000_000_000;
export const DAYS_MIN = 1;
export const DAYS_MAX = 60;
export const POSSESSION_DAYS_MAX = 90;
const daysMsg = `Enter whole days, ${DAYS_MIN} to ${DAYS_MAX}.`;

// ---------- stored data ----------

const validDate = z.string().refine((s) => {
  try {
    parseYmd(s);
    return true;
  } catch {
    return false;
  }
}, 'Enter a valid date.');

const money = z.number().int().min(0).max(MAX_MONEY);
const days = z.number().int().min(DAYS_MIN).max(DAYS_MAX);
const list = z.array(z.string().trim().min(1).max(200)).max(30);

const withDays = z.object({ included: z.boolean(), days: days.nullable() });

export const termSheetDataSchema = z
  .object({
    property: z.object({ address: z.string().trim().max(300), pin: z.string().regex(/^\d{10}$/).nullable() }),
    price: money.nullable(),
    earnestMoney: money.nullable(),
    financing: z.object({
      type: z.enum(FINANCING_TYPES),
      downPaymentPct: z.number().min(0).max(100).nullable(),
    }),
    contingencies: z.object({
      inspection: withDays,
      financing: withDays,
      appraisal: z.object({ included: z.boolean() }),
      titleReview: withDays,
      saleOfBuyersHome: z.object({ included: z.boolean() }),
      hoaReview: withDays,
      sellerDisclosureNote: z.string().trim().max(1000),
    }),
    closingDate: validDate.nullable(),
    possession: z.object({
      mode: z.enum(['on_closing', 'days_after']),
      days: z.number().int().min(1).max(POSSESSION_DAYS_MAX).nullable(),
    }),
    itemsIncluded: list,
    itemsExcluded: list,
    sellerCredit: money.nullable(),
    escalation: z.object({
      enabled: z.boolean(),
      increment: money.nullable(),
      cap: money.nullable(),
    }),
    notes: z.string().trim().max(5000),
    questions: list,
  })
  .superRefine((d, ctx) => {
    for (const k of ['inspection', 'financing', 'titleReview', 'hoaReview'] as const) {
      const c = d.contingencies[k];
      if (c.included && c.days === null) ctx.addIssue({ code: 'custom', path: ['contingencies', k, 'days'], message: daysMsg });
    }
    if (d.possession.mode === 'days_after' && d.possession.days === null) {
      ctx.addIssue({ code: 'custom', path: ['possession', 'days'], message: 'Enter the number of days.' });
    }
  });

export type TermSheetData = z.infer<typeof termSheetDataSchema>;

// ---------- form input ----------

const str = (max: number, msg = 'That entry is too long.') =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : ''), z.string().max(max, msg));

const optInt = (min: number, max: number, msg: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.replace(/[$,\s]/g, '') : undefined),
    z
      .string()
      .regex(/^\d+$/, msg)
      .transform(Number)
      .pipe(z.number().min(min, msg).max(max, msg))
      .optional(),
  );

const dollars = (msg = 'Enter whole dollars, for example 850000.') => optInt(0, MAX_MONEY, msg);
const dayCount = () => optInt(DAYS_MIN, DAYS_MAX, daysMsg);

const optPct = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.replace(/[%\s]/g, '') : undefined),
  z
    .string()
    .regex(/^\d{1,3}(\.\d{1,2})?$/, 'Enter a percentage from 0 to 100.')
    .transform(Number)
    .pipe(z.number().min(0, 'Enter a percentage from 0 to 100.').max(100, 'Enter a percentage from 0 to 100.'))
    .optional(),
);

const optDate = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
  validDate.optional(),
);

const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean());

const lines = (label: string) =>
  z.preprocess(
    (v) =>
      typeof v === 'string'
        ? v
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    z
      .array(z.string().max(200, `Keep each ${label} entry under 200 characters.`))
      .max(30, `Enter up to 30 ${label} entries.`),
  );

const formSchema = z
  .object({
    address: z.preprocess(
      (v) => (typeof v === 'string' ? v.trim() : ''),
      z.string().min(1, 'Enter the property address.').max(300, 'That address is too long.'),
    ),
    pin: z.preprocess(
      (v) => (typeof v === 'string' && v.replace(/[\s-]/g, '') !== '' ? v.replace(/[\s-]/g, '') : undefined),
      z.string().regex(/^\d{10}$/, 'The parcel PIN is 10 digits.').optional(),
    ),
    price: dollars(),
    earnestMoney: dollars(),
    financingType: z.enum(FINANCING_TYPES, { message: 'Choose a financing type.' }),
    downPaymentPct: optPct,
    inspection_included: checkbox,
    inspection_days: dayCount(),
    financing_included: checkbox,
    financing_days: dayCount(),
    appraisal_included: checkbox,
    titleReview_included: checkbox,
    titleReview_days: dayCount(),
    saleOfBuyersHome_included: checkbox,
    hoaReview_included: checkbox,
    hoaReview_days: dayCount(),
    sellerDisclosureNote: str(1000, 'That note is too long.'),
    closingDate: optDate,
    possessionMode: z.enum(['on_closing', 'days_after'], { message: 'Choose a possession option.' }),
    possessionDays: optInt(1, POSSESSION_DAYS_MAX, `Enter whole days, 1 to ${POSSESSION_DAYS_MAX}.`),
    itemsIncluded: lines('included items'),
    itemsExcluded: lines('excluded items'),
    sellerCredit: dollars(),
    escalation_enabled: checkbox,
    escalation_increment: dollars(),
    escalation_cap: dollars(),
    notes: str(5000, 'Notes are too long.'),
    questions: lines('questions'),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    for (const k of ['inspection', 'financing', 'titleReview', 'hoaReview'] as const) {
      need(!v[`${k}_included`] || v[`${k}_days`] !== undefined, `${k}_days`, daysMsg);
    }
    need(v.possessionMode !== 'days_after' || v.possessionDays !== undefined, 'possessionDays', 'Enter the number of days.');
    if (v.escalation_enabled) {
      need((v.escalation_increment ?? 0) > 0, 'escalation_increment', 'Enter the increment in whole dollars.');
      need((v.escalation_cap ?? 0) > 0, 'escalation_cap', 'Enter the cap in whole dollars.');
      if (v.escalation_increment !== undefined && v.escalation_cap !== undefined) {
        need(v.escalation_cap >= v.escalation_increment, 'escalation_cap', 'The cap is lower than the increment.');
      }
      if (v.price !== undefined && v.escalation_cap !== undefined) {
        need(v.escalation_cap > v.price, 'escalation_cap', 'The cap is not above the price entered.');
      }
    }
  })
  .transform(
    (v): TermSheetData => ({
      property: { address: v.address, pin: v.pin ?? null },
      price: v.price ?? null,
      earnestMoney: v.earnestMoney ?? null,
      financing: {
        type: v.financingType,
        downPaymentPct: v.financingType === 'cash' ? null : (v.downPaymentPct ?? null),
      },
      contingencies: {
        inspection: { included: v.inspection_included, days: v.inspection_included ? (v.inspection_days ?? null) : null },
        financing: { included: v.financing_included, days: v.financing_included ? (v.financing_days ?? null) : null },
        appraisal: { included: v.appraisal_included },
        titleReview: { included: v.titleReview_included, days: v.titleReview_included ? (v.titleReview_days ?? null) : null },
        saleOfBuyersHome: { included: v.saleOfBuyersHome_included },
        hoaReview: { included: v.hoaReview_included, days: v.hoaReview_included ? (v.hoaReview_days ?? null) : null },
        sellerDisclosureNote: v.sellerDisclosureNote,
      },
      closingDate: v.closingDate ?? null,
      possession:
        v.possessionMode === 'days_after'
          ? { mode: 'days_after', days: v.possessionDays ?? null }
          : { mode: 'on_closing', days: null },
      itemsIncluded: v.itemsIncluded,
      itemsExcluded: v.itemsExcluded,
      sellerCredit: v.sellerCredit ?? null,
      escalation: v.escalation_enabled
        ? { enabled: true, increment: v.escalation_increment ?? null, cap: v.escalation_cap ?? null }
        : { enabled: false, increment: null, cap: null },
      notes: v.notes,
      questions: v.questions,
    }),
  );

export type TermSheetParse =
  | { ok: true; data: TermSheetData }
  | { ok: false; errors: Record<string, string> };

/** Parses form-shaped input (string values). Errors are keyed by form field name. */
export function parseTermSheetForm(raw: unknown): TermSheetParse {
  // A days value left in an unchecked contingency is ignored rather than blocking the save.
  const input = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : raw;
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>;
    for (const k of ['inspection', 'financing', 'titleReview', 'hoaReview']) {
      const on = rec[`${k}_included`];
      if (!(on === 'on' || on === 'true' || on === true)) delete rec[`${k}_days`];
    }
  }
  const r = formSchema.safeParse(input);
  if (!r.success) {
    const errors: Record<string, string> = {};
    for (const i of r.error.issues) errors[String(i.path[0] ?? 'form')] ??= i.message;
    return { ok: false, errors };
  }
  return { ok: true, data: termSheetDataSchema.parse(r.data) };
}

/** Form field values (all strings) for stored or default data. Checkboxes are 'on' or ''. */
export function dataToForm(d: TermSheetData): Record<string, string> {
  const n = (v: number | null) => (v === null ? '' : String(v));
  const c = d.contingencies;
  return {
    address: d.property.address,
    pin: d.property.pin ?? '',
    price: n(d.price),
    earnestMoney: n(d.earnestMoney),
    financingType: d.financing.type,
    downPaymentPct: n(d.financing.downPaymentPct),
    inspection_included: c.inspection.included ? 'on' : '',
    inspection_days: n(c.inspection.days),
    financing_included: c.financing.included ? 'on' : '',
    financing_days: n(c.financing.days),
    appraisal_included: c.appraisal.included ? 'on' : '',
    titleReview_included: c.titleReview.included ? 'on' : '',
    titleReview_days: n(c.titleReview.days),
    saleOfBuyersHome_included: c.saleOfBuyersHome.included ? 'on' : '',
    hoaReview_included: c.hoaReview.included ? 'on' : '',
    hoaReview_days: n(c.hoaReview.days),
    sellerDisclosureNote: c.sellerDisclosureNote,
    closingDate: d.closingDate ?? '',
    possessionMode: d.possession.mode,
    possessionDays: n(d.possession.days),
    itemsIncluded: d.itemsIncluded.join('\n'),
    itemsExcluded: d.itemsExcluded.join('\n'),
    sellerCredit: n(d.sellerCredit),
    escalation_enabled: d.escalation.enabled ? 'on' : '',
    escalation_increment: n(d.escalation.increment),
    escalation_cap: n(d.escalation.cap),
    notes: d.notes,
    questions: d.questions.join('\n'),
  };
}
