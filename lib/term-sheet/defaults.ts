// Starting values for a deal's term sheet. The price is never prefilled (not even from the list
// price): it is the buyer's own figure. Contingency days come from the deal's saved periods or the
// common defaults in WA_DEFAULTS; the buyer can change everything.

import { WA_DEFAULTS, type DefaultKind } from '@/lib/deadlines/rules/wa-defaults';
import type { TermSheetData } from './schema';

export type DealForTermSheet = {
  address: string;
  parcelPin: string | null;
  closingDate: string | null;
  possessionDaysAfterClosing: number;
  periodOverrides: Record<string, number | null>;
};

function period(deal: DealForTermSheet, kind: DefaultKind): { included: boolean; days: number | null } {
  const o = deal.periodOverrides[kind];
  if (o === null) return { included: false, days: null }; // saved as "not in my contract"
  if (typeof o === 'number') return { included: true, days: o };
  const d = WA_DEFAULTS.find((x) => x.kind === kind)!;
  return { included: true, days: d.days };
}

export function termSheetDefaults(deal: DealForTermSheet): TermSheetData {
  const after = deal.possessionDaysAfterClosing;
  return {
    property: { address: deal.address, pin: deal.parcelPin },
    price: null,
    earnestMoney: null,
    financing: { type: 'conventional', downPaymentPct: null },
    contingencies: {
      inspection: period(deal, 'inspection'),
      financing: period(deal, 'financing'),
      appraisal: { included: false },
      titleReview: { included: false, days: null },
      saleOfBuyersHome: { included: false },
      hoaReview: { included: false, days: null },
      sellerDisclosureNote: '',
    },
    closingDate: deal.closingDate,
    possession: after > 0 ? { mode: 'days_after', days: Math.min(after, 90) } : { mode: 'on_closing', days: null },
    itemsIncluded: [],
    itemsExcluded: [],
    sellerCredit: null,
    escalation: { enabled: false, increment: null, cap: null },
    notes: '',
    questions: [],
  };
}
