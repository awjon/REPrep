// Required on every analytical surface (CLAUDE.md §3.5). Copy changes need the guardrail review.

export type DisclaimerKind = 'deadlines' | 'review' | 'comps' | 'lot' | 'term-sheet';

export const DISCLAIMER_TEXT: Record<DisclaimerKind, string> = {
  deadlines:
    'Dates are computed from common Washington defaults and the inputs you entered. They are not legal advice. Confirm every date against your signed contract and with a Washington real estate attorney.',
  review:
    'This is an automated reading of the document to help you prepare questions. It can miss or misread things and is not legal advice or a professional inspection. Confirm with a Washington real estate attorney.',
  comps:
    'Comparable recorded sales from King County public data. This is not an appraisal or a valuation, not advice on what to offer, and not legal advice. Confirm with a Washington real estate attorney.',
  lot: 'Flags restate King County Assessor records and, where configured, City of Seattle GIS overlays. Not a determination of what can be built and not legal advice. Confirm with the Seattle Department of Construction and Inspections and a Washington real estate attorney.',
  'term-sheet':
    'A summary of terms you entered, for discussion with your attorney. It is not a contract and not legal advice. Confirm terms with a Washington real estate attorney.',
};

export function Disclaimer({ kind }: { kind: DisclaimerKind }) {
  return (
    <p role="note" data-disclaimer={kind} className="mt-6 border-t border-line pt-3 text-xs leading-relaxed text-muted">
      {DISCLAIMER_TEXT[kind]}
    </p>
  );
}
