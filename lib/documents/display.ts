// Display helpers for the documents pages. Pure.

import { TYPE_PROMPTS } from '@/lib/review/prompts';
import type { ReviewDocType } from '@/lib/review/schema';

export function docTypeLabel(t: string): string {
  if (t in TYPE_PROMPTS) return TYPE_PROMPTS[t as ReviewDocType].label;
  return t === 'unknown' ? 'Not yet identified' : 'Other document';
}

export function reviewStatusLabel(run: { status: string; error: string | null } | null, findingCount: number): string {
  if (!run) return 'Not reviewed';
  if (run.status === 'running' || run.status === 'queued') return 'Review in progress';
  if (run.status === 'failed') return 'Review did not complete';
  return `${findingCount} ${findingCount === 1 ? 'finding' : 'findings'}`;
}

export const formatUsd = (s: string | number): string => `$${Number(s).toFixed(2)}`;

export const SEVERITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', info: 'Note' } as const;
