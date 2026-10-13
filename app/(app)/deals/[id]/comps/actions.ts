'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { FormState } from '@/components/deals/form-state';
import { requireUser } from '@/lib/auth';
import { saveCompSet, setDealParcelPin, pinSchema } from '@/lib/comps/mutations';
import { paramsToSearch, parseCompParams } from '@/lib/comps/params';
import { getSubject } from '@/lib/comps/query';
import { runComps } from '@/lib/comps/service';
import { schema, withUser } from '@/lib/db/client';

const compsPath = (dealId: string, qs = '') => `/deals/${dealId}/comps${qs ? `?${qs}` : ''}`;

/** Result button in the address search. */
export async function selectParcelAction(dealId: string, pin: string): Promise<void> {
  const user = await requireUser();
  await withUser(user.id, (tx) => setDealParcelPin(tx, dealId, pin));
  revalidatePath(`/deals/${dealId}`, 'layout');
  redirect(compsPath(dealId));
}

/** Direct 10-digit PIN entry. */
export async function enterPinAction(dealId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = String(form.get('pin') ?? '');
  const parsed = pinSchema.safeParse(raw);
  if (!parsed.success) return { errors: { pin: parsed.error.issues[0]!.message }, values: { pin: raw } };
  try {
    await withUser(user.id, (tx) => setDealParcelPin(tx, dealId, parsed.data));
  } catch (e) {
    const notFound = e instanceof Error && e.message === 'parcel not found';
    return {
      errors: notFound ? { pin: 'That PIN is not in the King County data we have loaded.' } : undefined,
      message: notFound ? undefined : 'Could not save. Try again.',
      values: { pin: raw },
    };
  }
  revalidatePath(`/deals/${dealId}`, 'layout');
  redirect(compsPath(dealId));
}

/** Re-runs the comps from the (validated) filters, then stores params + a results snapshot. */
export async function saveCompSetAction(dealId: string, form: FormData): Promise<void> {
  const user = await requireUser();
  const params = parseCompParams(Object.fromEntries(new URLSearchParams(String(form.get('qs') ?? ''))));
  await withUser(user.id, async (tx) => {
    const [deal] = await tx.select({ pin: schema.deals.parcelPin }).from(schema.deals).where(eq(schema.deals.id, dealId));
    if (!deal?.pin) throw new Error('deal has no parcel');
    const subject = await getSubject(tx, deal.pin);
    if (!subject) throw new Error('parcel not found');
    const report = await runComps(tx, subject, params);
    await saveCompSet(tx, dealId, params, report.snapshot);
  });
  redirect(compsPath(dealId, paramsToSearch(params)));
}
