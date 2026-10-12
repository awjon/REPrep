// Type-specific focus lists. Each is versioned; the stored prompt version is `${SHARED_VERSION}.${type}.${version}`.
// Changes need the guardrail review.

import type { ReviewDocType } from '../schema';
import { SHARED_VERSION } from './shared';

type TypePrompt = { version: string; label: string; focus: string };

export const TYPE_PROMPTS: Record<ReviewDocType, TypePrompt> = {
  form17: {
    version: 'v1',
    label: 'Seller disclosure statement',
    focus: `This is a seller disclosure statement. Look for:
- questions answered "Yes" that call for an explanation, and whether an explanation is given
- "Don't know" answers and blank answers on significant topics
- explanations that conflict with the yes/no answer, or answers that conflict with each other
- water intrusion, drainage, flooding, or flood zone status
- roof, structure, foundation, or settling
- sewer or septic system type, condition, or inspection history
- heating oil tanks, asbestos, lead-based paint, mold, radon, or other environmental items
- work done with or without permits, and additions or conversions
- boundary disputes, encroachments, easements, shared driveways or walls
- HOA or road maintenance obligations and any assessments
- water source and any well, and utilities
Category examples: "Water intrusion", "Septic/sewer", "Permits", "Environmental", "Boundaries", "Unanswered question".`,
  },
  inspection: {
    version: 'v1',
    label: 'Home inspection report',
    focus: `This is a home inspection report. Look for:
- items the inspector labels as safety concerns or as needing prompt attention
- signs of water intrusion, moisture, or active leaks
- structural or foundation observations
- roof condition and remaining life as stated
- electrical items (panel type, ungrounded outlets, missing GFCI/AFCI, knob-and-tube, aluminum wiring)
- plumbing (supply and drain materials, leaks, water heater age/strapping), and any sewer scope note
- heating/cooling equipment age and condition, and any oil tank mention
- items the inspector deferred to a specialist (structural engineer, roofer, electrician, sewer scope, pest)
- areas the inspector could not access or did not inspect
Category examples: "Safety", "Roof", "Moisture", "Electrical", "Plumbing", "Referred to specialist", "Not inspected".`,
  },
  title: {
    version: 'v1',
    label: 'Title commitment',
    focus: `This is a preliminary title report or title commitment. Look for:
- requirements that must be satisfied before closing
- listed exceptions: easements, covenants/CC&Rs, agreements, reservations, rights of way
- liens, deeds of trust, judgments, assessments, or delinquent taxes
- encroachments, boundary or survey matters
- the vested owner's name and the legal description, and any mismatch with other parties named
- the effective date and the proposed insured amount
Category examples: "Requirement before closing", "Easement", "Lien", "Covenant", "Vesting", "Survey".`,
  },
  hoa: {
    version: 'v1',
    label: 'HOA documents',
    focus: `These are HOA or condominium documents (declaration, CC&Rs, bylaws, resale certificate, budget, or minutes). Look for:
- regular dues and any special assessments, current or planned
- reserve fund balance or reserve study statements
- pending or past litigation involving the association
- restrictions on renting or leasing (minimum terms, caps, short-term rental bans)
- restrictions on accessory dwelling units, additions, outbuildings, or exterior changes
- pet, parking, use, or business restrictions
- insurance the association carries and what owners must carry
- transfer fees, right of first refusal, or approval requirements
Category examples: "Dues", "Special assessment", "Rental restriction", "ADU/building restriction", "Litigation", "Reserves".`,
  },
};

export function promptVersion(docType: ReviewDocType): string {
  return `${SHARED_VERSION}.${docType}.${TYPE_PROMPTS[docType].version}`;
}

export function userInstruction(docType: ReviewDocType, pageOffset: number, pageCount: number): string {
  const part =
    pageOffset > 0
      ? `\nThis PDF is an excerpt: its page 1 is page ${pageOffset + 1} of the full document. Still number pages from 1 within this PDF.`
      : '';
  return `${TYPE_PROMPTS[docType].focus}\n\nThe PDF has ${pageCount} page${pageCount === 1 ? '' : 's'}.${part}\nCall record_findings once with all findings.`;
}
