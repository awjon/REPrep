'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import type { FormState } from '@/components/deals/form-state';
import {
  addCustomDeadline,
  customDeadlineSchema,
  deleteCustomDeadline,
  exactDateSchema,
  fieldErrors,
  pinDealDate,
  restoreComputedDate,
  saveScheduleInputs,
  scheduleInputsSchema,
  setDealDateDone,
} from '@/lib/deals/mutations';

const strings = (form: FormData): Record<string, string> =>
  Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>;

const refresh = (dealId: string) => {
  revalidatePath('/deals');
  revalidatePath(`/deals/${dealId}`, 'layout');
};

export async function saveScheduleAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = strings(form);
  const parsed = scheduleInputsSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  try {
    await withUser(user.id, (tx) => saveScheduleInputs(tx, dealId, raw));
  } catch {
    return { message: 'Could not save. Try again.', values: raw };
  }
  refresh(dealId);
  return { saved: true, values: raw };
}

export async function addCustomAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = strings(form);
  const parsed = customDeadlineSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  try {
    await withUser(user.id, (tx) => addCustomDeadline(tx, dealId, raw));
  } catch {
    return { message: 'Could not add the deadline. Try again.', values: raw };
  }
  refresh(dealId);
  return { saved: true, values: {} };
}

export async function toggleDoneAction(dealId: string, dealDateId: string, done: boolean): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (tx) => setDealDateDone(tx, dealDateId, done));
  refresh(dealId);
}

export async function pinDateAction(dealId: string, dealDateId: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = exactDateSchema.safeParse(strings(form));
  if (!parsed.success) return; // the date input is `required`; nothing to change otherwise
  await withUser(user.id, (tx) => pinDealDate(tx, dealDateId, parsed.data.date));
  refresh(dealId);
}

export async function restoreComputedAction(dealId: string, dealDateId: string): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (tx) => restoreComputedDate(tx, dealDateId));
  refresh(dealId);
}

export async function deleteCustomAction(dealId: string, dealDateId: string): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (tx) => deleteCustomDeadline(tx, dealDateId));
  refresh(dealId);
}
