'use client';

import { useActionState } from 'react';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { DEAL_STATUSES, statusLabel } from '@/lib/deals/format';
import type { FormState } from './form-state';

export type DealValues = { address: string; parcelPin: string; listPrice: string; notes: string; status?: string };

export function DealForm({
  action,
  initial,
  showStatus,
  submitLabel,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: DealValues;
  showStatus?: boolean;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...initial, ...state.values };
  const e = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
      <TextField
        label="Address"
        name="address"
        defaultValue={v.address}
        required
        autoComplete="street-address"
        error={e.address}
      />
      {showStatus && (
        <SelectField label="Status" name="status" defaultValue={v.status ?? 'watching'} error={e.status}>
          {DEAL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </SelectField>
      )}
      <TextField
        label="Parcel PIN (optional)"
        name="parcelPin"
        defaultValue={v.parcelPin}
        inputMode="numeric"
        maxLength={10}
        placeholder="10 digits"
        hint="King County parcel number, 10 digits with no dashes."
        error={e.parcelPin}
      />
      <TextField
        label="List price (optional)"
        name="listPrice"
        defaultValue={v.listPrice}
        inputMode="numeric"
        placeholder="850000"
        hint="Whole dollars."
        error={e.listPrice}
      />
      <TextAreaField label="Notes" name="notes" defaultValue={v.notes} rows={5} error={e.notes} />
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        {state.saved && (
          <p role="status" className="text-sm text-accent">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
