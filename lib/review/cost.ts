// USD per million tokens (base rates, no batch/caching discounts), from
// https://platform.claude.com/docs/en/about-claude/pricing as of 2026-10-12.
// Update when MODEL_REVIEW / MODEL_TRIAGE change.

const PRICES: { prefix: string; input: number; output: number }[] = [
  { prefix: 'claude-opus-5-5', input: 4, output: 20 },
  { prefix: 'claude-sonnet-5-5', input: 2, output: 10 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10 },
  { prefix: 'claude-haiku-4-5', input: 1, output: 5 },
];

export type Usage = { inputTokens: number; outputTokens: number };

/** Cost in USD, or null when the model is not in the price table (logged so it gets added). */
export function costUsd(model: string, usage: Usage): number | null {
  const p = PRICES.find((x) => model.startsWith(x.prefix));
  if (!p) return null;
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens };
}
