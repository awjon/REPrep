// Document review pipeline. The model client is injected so tests run without network.
// Flow: page texts → (classify if type unknown) → split → review chunks in parallel → validate → cost.

import { addUsage, costUsd, type Usage } from './cost';
import { MAX_TOTAL_PAGES, isMostlyScanned, pageTexts as extractPageTexts, splitPdf } from './pdf';
import { CLASSIFY_TOOL, RECORD_FINDINGS_TOOL, SYSTEM_PROMPT } from './prompts/shared';
import { promptVersion, userInstruction } from './prompts';
import { classifyOutput, modelOutput, REVIEW_DOC_TYPES, type ReviewDocType, type ValidatedFinding } from './schema';
import { validateFindings, type ChunkResult } from './validate';

/** The subset of the Anthropic SDK we use. */
export type MessagesClient = {
  messages: {
    create(args: {
      model: string;
      max_tokens: number;
      system: string;
      tools: unknown[];
      tool_choice: { type: 'tool'; name: string };
      messages: { role: 'user'; content: unknown[] }[];
    }): Promise<{
      content: { type: string; name?: string; input?: unknown }[];
      usage: { input_tokens: number; output_tokens: number };
      stop_reason?: string | null;
    }>;
  };
};

export type ReviewProgress =
  | { stage: 'reading'; pages: number }
  | { stage: 'classified'; docType: ReviewDocType | 'other' }
  | { stage: 'reviewing'; chunk: number; of: number }
  | { stage: 'validating' };

export type ReviewResult = {
  docType: ReviewDocType;
  promptVersion: string;
  findings: ValidatedFinding[];
  dropped: number;
  dropReasons: Record<string, number>;
  pagesReviewed: number;
  mostlyScanned: boolean;
  usage: Usage;
  costUsd: number;
};

export class ReviewError extends Error {
  constructor(
    public code: 'not_pdf' | 'too_many_pages' | 'unsupported_type' | 'model_error' | 'encrypted',
    message: string,
  ) {
    super(message);
  }
}

// Deterministic first: most documents announce what they are on page 1.
const TYPE_HINTS: [ReviewDocType, RegExp][] = [
  ['form17', /seller\s+disclosure\s+statement/i],
  ['title', /(commitment\s+for\s+title\s+insurance|preliminary\s+(title\s+)?report|title\s+commitment)/i],
  ['inspection', /(home|property|building)\s+inspection\s+report|inspection\s+agreement/i],
  ['hoa', /(declaration\s+of\s+(covenants|condominium)|cc&rs|homeowners'?\s+association|resale\s+certificate)/i],
];

export function guessDocType(firstPagesText: string): ReviewDocType | null {
  for (const [type, re] of TYPE_HINTS) if (re.test(firstPagesText)) return type;
  return null;
}

function toolInput(res: Awaited<ReturnType<MessagesClient['messages']['create']>>, name: string): unknown {
  const block = res.content.find((b) => b.type === 'tool_use' && b.name === name);
  if (!block) throw new ReviewError('model_error', `model did not call ${name}`);
  return block.input;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export async function reviewDocument(opts: {
  pdf: Uint8Array;
  docType: ReviewDocType | 'unknown';
  client: MessagesClient;
  models: { review: string; triage: string };
  onProgress?: (p: ReviewProgress) => void;
  /** test seam */
  readPages?: (pdf: Uint8Array) => Promise<string[]>;
}): Promise<ReviewResult> {
  const progress = opts.onProgress ?? (() => {});
  let texts: string[];
  try {
    texts = await (opts.readPages ?? extractPageTexts)(opts.pdf);
  } catch {
    throw new ReviewError('not_pdf', 'could not read the PDF');
  }
  if (texts.length > MAX_TOTAL_PAGES) throw new ReviewError('too_many_pages', `more than ${MAX_TOTAL_PAGES} pages`);
  progress({ stage: 'reading', pages: texts.length });

  let usage: Usage = { inputTokens: 0, outputTokens: 0 };
  let cost = 0;
  const track = (model: string, u: { input_tokens: number; output_tokens: number }) => {
    const add = { inputTokens: u.input_tokens, outputTokens: u.output_tokens };
    usage = addUsage(usage, add);
    cost += costUsd(model, add) ?? 0;
  };

  let docType: ReviewDocType | 'other';
  if (opts.docType !== 'unknown') {
    docType = opts.docType;
  } else {
    docType = guessDocType(texts.slice(0, 2).join('\n')) ?? 'other';
    if (docType === 'other') {
      // Only the first pages go to the triage model.
      const first = await splitPdf(opts.pdf, 3);
      const res = await opts.client.messages.create({
        model: opts.models.triage,
        max_tokens: 200,
        system: 'You classify real-estate documents.',
        tools: [CLASSIFY_TOOL],
        tool_choice: { type: 'tool', name: CLASSIFY_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(first[0]!.bytes) } },
              { type: 'text', text: 'What kind of document is this?' },
            ],
          },
        ],
      });
      track(opts.models.triage, res.usage);
      const parsed = classifyOutput.safeParse(toolInput(res, CLASSIFY_TOOL.name));
      docType = parsed.success ? parsed.data.doc_type : 'other';
    }
  }
  progress({ stage: 'classified', docType });
  if (!(REVIEW_DOC_TYPES as readonly string[]).includes(docType)) {
    throw new ReviewError('unsupported_type', 'this does not look like a document type REPrep reviews');
  }
  const type = docType as ReviewDocType;

  let chunks;
  try {
    chunks = await splitPdf(opts.pdf);
  } catch {
    throw new ReviewError('encrypted', 'the PDF is encrypted or damaged');
  }

  let done = 0;
  const results: ChunkResult[] = await Promise.all(
    chunks.map(async (chunk) => {
      const res = await opts.client.messages.create({
        model: opts.models.review,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: [RECORD_FINDINGS_TOOL],
        tool_choice: { type: 'tool', name: RECORD_FINDINGS_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64(chunk.bytes) } },
              { type: 'text', text: userInstruction(type, chunk.pageOffset, chunk.pageCount) },
            ],
          },
        ],
      });
      track(opts.models.review, res.usage);
      const out = modelOutput.safeParse(toolInput(res, RECORD_FINDINGS_TOOL.name));
      progress({ stage: 'reviewing', chunk: ++done, of: chunks.length });
      return { raw: out.success ? out.data.findings : [], pageOffset: chunk.pageOffset, pageCount: chunk.pageCount };
    }),
  );

  progress({ stage: 'validating' });
  const { kept, dropped } = validateFindings(results, texts);
  const dropReasons: Record<string, number> = {};
  for (const d of dropped) dropReasons[d.reason] = (dropReasons[d.reason] ?? 0) + 1;

  return {
    docType: type,
    promptVersion: promptVersion(type),
    findings: kept,
    dropped: dropped.length,
    dropReasons,
    pagesReviewed: texts.length,
    mostlyScanned: isMostlyScanned(texts),
    usage,
    costUsd: Math.round(cost * 10_000) / 10_000,
  };
}
