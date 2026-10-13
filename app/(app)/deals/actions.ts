'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import type { FormState } from '@/components/deals/form-state';
import { eq } from 'drizzle-orm';
import { documents } from '@/lib/db/schema';
import { removeObjects } from '@/lib/storage/documents';
import { createDeal, dealFieldsSchema, dealUpdateSchema, deleteDeal, fieldErrors, updateDeal } from '@/lib/deals/mutations';

const strings = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;

export async function createDealAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = strings(form);
  const parsed = dealFieldsSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  let id: string;
  try {
    id = await withUser(user.id, (tx) => createDeal(tx, raw));
  } catch {
    return { message: 'Could not save the property. Try again.', values: raw };
  }
  revalidatePath('/deals');
  redirect(`/deals/${id}`);
}

export async function updateDealAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = strings(form);
  const parsed = dealUpdateSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  try {
    await withUser(user.id, (tx) => updateDeal(tx, dealId, raw));
  } catch {
    return { message: 'Could not save changes. Try again.', values: raw };
  }
  revalidatePath('/deals');
  revalidatePath(`/deals/${dealId}`, 'layout');
  return { saved: true, values: raw };
}

export async function deleteDealAction(dealId: string): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, async (tx) => {
    // Hard delete (CLAUDE.md §3.7): remove the deal's files from storage before the rows.
    // If storage removal fails, the transaction aborts and the deal stays, so it can be retried.
    const files = await tx.select({ path: documents.storagePath }).from(documents).where(eq(documents.dealId, dealId));
    await removeObjects(files.map((f) => f.path));
    await deleteDeal(tx, dealId);
  });
  revalidatePath('/deals');
  redirect('/deals');
}
