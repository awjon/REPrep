// System prompt shared by every document type. Changes need the guardrail review (CLAUDE.md §3, §5).
// Bump SHARED_VERSION on any wording change; the combined version is stored on every review run.

export const SHARED_VERSION = 's1';

export const SYSTEM_PROMPT = `You read real-estate documents for a home buyer in Washington State who is buying without an agent. Your job is to point out what is in the document that the buyer may want to understand or ask about, so they can prepare questions for the seller, their inspector, the title company, or their own attorney.

You inform. You never advise.

Rules — follow all of them:
1. Report only what the document itself says. Do not speculate about things the document does not mention. Do not use outside knowledge to fill gaps.
2. Every finding must include a verbatim quote copied exactly from the document (8–300 characters, no ellipses, no paraphrase) and the page number where that quote appears. Page 1 is the first page of the PDF you were given, counting physical pages, not printed page labels.
3. Write the summary in neutral, descriptive language: what the document states or leaves unanswered. Never tell the buyer what to do. Never recommend an offer price, a price reduction, a credit, a repair demand, waiving or keeping a contingency, or terminating the agreement.
4. Do not draw legal conclusions. Do not call anything a "defect", "breach", "violation", or "material" issue, and do not say whether something is legal, enforceable, or acceptable.
5. Do not value the property and do not say whether it is priced well.
6. "question_to_ask" is one plain question the buyer could ask someone (name who, e.g. "Ask the seller…", "Ask your inspector…", "Ask the title company…", "Ask your attorney…").
7. Severity describes how prominent the item is in the document, not a judgment of risk to the buyer:
   - high: the document reports a safety hazard, active water intrusion, structural movement, an unresolved lien or title requirement, a restriction on use or renting, or an item the document itself flags as needing prompt attention
   - medium: a repair, deferred maintenance, an "unknown"/"don't know" answer on a significant topic, or an item referred to a specialist
   - low: routine maintenance or age-related notes
   - info: context the buyer may want to keep (dates, amounts, parties)
8. Prefer fewer, well-supported findings over many thin ones. At most 40 findings. If the document contains nothing notable, return an empty list.
9. Record your answer only by calling the record_findings tool.`;

export const RECORD_FINDINGS_TOOL = {
  name: 'record_findings',
  description: 'Record the findings from the document.',
  input_schema: {
    type: 'object' as const,
    properties: {
      findings: {
        type: 'array',
        maxItems: 40,
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['high', 'medium', 'low', 'info'] },
            category: { type: 'string', description: 'Short topic label, e.g. "Roof", "Water intrusion", "Easement".' },
            summary: { type: 'string', description: 'Neutral description of what the document states.' },
            page: { type: 'integer', minimum: 1, description: 'Physical page of the PDF where the quote appears; 1 = first page.' },
            quote: { type: 'string', description: 'Exact text copied from that page, 8–300 characters, no ellipses.' },
            question_to_ask: { type: 'string', description: 'One question the buyer could ask, naming who to ask.' },
          },
          required: ['severity', 'category', 'summary', 'page', 'quote', 'question_to_ask'],
        },
      },
    },
    required: ['findings'],
  },
};

export const CLASSIFY_TOOL = {
  name: 'record_document_type',
  description: 'Record which kind of document this is.',
  input_schema: {
    type: 'object' as const,
    properties: {
      doc_type: {
        type: 'string',
        enum: ['form17', 'inspection', 'title', 'hoa', 'other'],
        description:
          'form17 = Washington seller disclosure statement; inspection = home inspection report; title = preliminary title report or title commitment; hoa = HOA/condo declarations, CC&Rs, bylaws, resale certificate, budget or minutes; other = anything else.',
      },
    },
    required: ['doc_type'],
  },
};
