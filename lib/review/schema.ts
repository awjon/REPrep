import { z } from 'zod';

export const REVIEW_DOC_TYPES = ['form17', 'inspection', 'title', 'hoa'] as const;
export type ReviewDocType = (typeof REVIEW_DOC_TYPES)[number];

export const SEVERITIES = ['high', 'medium', 'low', 'info'] as const;

/** What the model must return per finding (validated before anything is stored or shown). */
export const modelFinding = z.object({
  severity: z.enum(SEVERITIES),
  category: z.string().trim().min(2).max(60),
  summary: z.string().trim().min(10).max(500),
  page: z.number().int().min(1),
  quote: z.string().trim().min(20).max(400),
  question_to_ask: z.string().trim().min(10).max(300),
});
export type ModelFinding = z.infer<typeof modelFinding>;

export const modelOutput = z.object({ findings: z.array(z.unknown()).max(60) });

export const classifyOutput = z.object({
  doc_type: z.enum([...REVIEW_DOC_TYPES, 'other']),
});

/** A finding after validation, with the page made absolute within the whole document. */
export type ValidatedFinding = {
  severity: ModelFinding['severity'];
  category: string;
  summary: string;
  page: number;
  quote: string;
  questionToAsk: string;
  quoteVerified: boolean;
};

export type DropReason = 'malformed' | 'page_out_of_range' | 'quote_not_on_page' | 'advice_language' | 'duplicate';
