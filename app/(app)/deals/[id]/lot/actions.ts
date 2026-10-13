'use server';

import { revalidatePath } from 'next/cache';
import type { FormState } from '@/components/deals/form-state';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { pinSchema, setParcelPin } from '@/lib/lot/mutations';

export async function savePinAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = { pin: typeof form.get('pin') === 'string' ? (form.get('pin') as string) : '' };
  const parsed = pinSchema.safeParse(raw.pin);
  if (!parsed.success) return { errors: { pin: parsed.error.issues[0]?.message ?? 'Enter a valid PIN.' }, values: raw };
  try {
    await withUser(user.id, (tx) => setParcelPin(tx, dealId, raw.pin));
  } catch {
    return { message: 'Could not save. Try again.', values: raw };
  }
  revalidatePath(`/deals/${dealId}`, 'layout');
  return { saved: true, values: { pin: parsed.data as string } };
}
