// Advice language REPrep must never show (CLAUDE.md §3.2). Used two ways:
//  - lint over UI copy (tests/unit/copy-lint.test.ts scans app/ and components/)
//  - filter over LLM review output (findings that match are dropped)
// Patterns target directive/advisory phrasing aimed at the user, not neutral description.
// Changes here need the guardrail review.

export const BANNED_PATTERNS: readonly { id: string; re: RegExp; why: string }[] = [
  { id: 'you-should', re: /\byou\s+(should|must|need\s+to|ought\s+to|have\s+to)\b/i, why: 'directs the buyer' },
  { id: 'we-recommend', re: /\b(we|i)\s+(recommend|advise|suggest)\b/i, why: 'gives advice' },
  { id: 'recommend-you', re: /\brecommend(ed)?\s+(that\s+)?you\b/i, why: 'gives advice' },
  { id: 'offer-amount', re: /\b(offer|bid)\s+(no\s+more\s+than|at\s+most|at\s+least|around|about)\s+\$/i, why: 'price advice' },
  { id: 'should-offer', re: /\bshould\s+(offer|bid|pay|counter)\b/i, why: 'price advice' },
  { id: 'fair-value', re: /\b(fair|true|market)\s+value\s+(is|of\s+this)\b/i, why: 'valuation claim' },
  { id: 'worth', re: /\b(this|the)\s+(home|house|property)\s+is\s+worth\b/i, why: 'valuation claim' },
  { id: 'overpriced', re: /\b(over|under)priced\b/i, why: 'valuation judgment' },
  { id: 'demand', re: /\b(demand|insist\s+on)\s+(a\s+)?(credit|repair|price\s+reduction|concession)/i, why: 'negotiation advice' },
  { id: 'walk-away', re: /\b(walk\s+away|back\s+out|terminate\s+the\s+(deal|contract|agreement))\b/i, why: 'directs a legal action' },
  { id: 'legal-conclusion', re: /\b(this\s+is|constitutes)\s+(a\s+)?(material\s+)?(defect|breach|violation)\b/i, why: 'legal conclusion' },
  { id: 'safe-to', re: /\b(it\s+is|it's)\s+(safe|fine|ok(ay)?)\s+to\s+(waive|skip|ignore|sign)\b/i, why: 'advice to waive' },
  { id: 'defect-word', re: /\bdefect(s|ive)?\b/i, why: 'legal/condition conclusion' },
  { id: 'violation-word', re: /\b(violat(e|es|ed|ion|ions)|illegal|unlawful|non-?compliant)\b/i, why: 'legal conclusion' },
  { id: 'ask-seller-concession', re: /\bask\s+(the\s+)?(seller|sellers|listing\s+agent)\s+(for|to)\s+(a\s+|an\s+)?(credit|reduc|lower|repair|fix|replace|pay|cover|concession|discount|cut)/i, why: 'negotiation request' },
  { id: 'credit-you', re: /\bcredit\s+(you|the\s+buyer)\b/i, why: 'negotiation request' },
  { id: 'price-reduction', re: /\bprice\s+(reduction|cut|drop)\b/i, why: 'price advice' },
  { id: 'lower-offer', re: /\b(lower|reduced|higher)\s+(offer|price|bid)\b/i, why: 'price advice' },
  { id: 'leverage', re: /\b(leverage|bargaining\s+chip)\b/i, why: 'negotiation advice' },
  { id: 'negotiate', re: /\bnegotiat\w*/i, why: 'negotiation advice' },
  { id: 'consider-action', re: /\bconsider\s+(waiving|terminating|walking|renegotiat\w*|backing|cancel\w*|withdraw\w*)/i, why: 'directs a legal action' },
  { id: 'justify', re: /\bjustif(y|ies|ied)\b(?!-)/i, why: 'price advice' },
  { id: 'dont-need-attorney', re: /\b(don't|do\s+not|no)\s+need\s+(an?\s+)?(attorney|lawyer|inspector)\b/i, why: 'discourages professional help' },
];

export type BannedHit = { id: string; why: string; match: string };

export function findBanned(text: string): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const p of BANNED_PATTERNS) {
    const m = p.re.exec(text);
    if (m) hits.push({ id: p.id, why: p.why, match: m[0] });
  }
  return hits;
}

export const isClean = (text: string) => findBanned(text).length === 0;
