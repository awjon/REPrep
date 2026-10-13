'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/deals/form-state';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { saveTermSheet } from '@/lib/term-sheet/mutations';
import { parseTermSheetForm } from '@/lib/term-sheet/schema';

const strings = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;

export async function saveTermSheetAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = strings(form);
  const parsed = parseTermSheetForm(raw);
  if (!parsed.ok) return { errors: parsed.errors, values: raw };
  try {
    await withUser(user.id, (tx) => saveTermSheet(tx, dealId, raw));
  } catch {
    return { message: 'Could not save. Try again.', values: raw };
  }
  revalidatePath(`/deals/${dealId}/term-sheet`);
  return { saved: true, values: raw };
}
