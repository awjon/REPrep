// Default contingency periods for a Washington residential purchase.
// These are common starting values, NOT the law and NOT the user's contract. Every one is
// editable per deal and every computed date is shown as "computed — confirm against your contract".
// Changes here need the guardrail review (CLAUDE.md §3, §5).

export type DefaultKind = 'earnest_money' | 'form17_review' | 'inspection' | 'financing';

export type DeadlineDefault = {
  kind: DefaultKind;
  label: string;
  days: number;
  /** Which event the period runs from. */
  from: 'mutual_acceptance' | 'form17_receipt';
  note: string;
};

export const WA_DEFAULTS: readonly DeadlineDefault[] = [
  {
    kind: 'earnest_money',
    label: 'Earnest money due',
    days: 2,
    from: 'mutual_acceptance',
    note: 'Common default of 2 days. Confirm the period in your purchase agreement.',
  },
  {
    kind: 'form17_review',
    label: 'Seller disclosure (Form 17) review window',
    days: 3,
    from: 'form17_receipt',
    note: 'Washington gives buyers a short window after receiving the seller disclosure statement. Confirm the period and how it was delivered.',
  },
  {
    kind: 'inspection',
    label: 'Inspection contingency',
    days: 10,
    from: 'mutual_acceptance',
    note: 'Common default of 10 days. Confirm the period in your inspection addendum.',
  },
  {
    kind: 'financing',
    label: 'Financing contingency',
    days: 21,
    from: 'mutual_acceptance',
    note: 'Common default of 21 days. Confirm the period in your financing addendum.',
  },
];

export const DEADLINE_HOUR = '21:00'; // periods expire at 9:00 pm Pacific
export const DAY_OF_REMINDER_HOUR = '09:00';
export const BUSINESS_DAY_THRESHOLD = 5; // periods of this many days or fewer skip weekends and holidays

export const CLOSING_NOTE =
  'Closing on a weekend or legal holiday is moved to the next business day. Also check the county recording office calendar. Confirm against your contract.';
export const POSSESSION_NOTE = 'Defaults to the closing date. Confirm the possession terms in your contract.';
