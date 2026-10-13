'use client';

import { useActionState } from 'react';
import type { FormState } from '@/components/deals/form-state';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';

export function PinForm({
  action,
  initial,
  label = 'Parcel PIN',
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: string;
  label?: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const value = state.values?.pin ?? initial;
  return (
    <form action={formAction} className="space-y-3">
      <TextField
        label={label}
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        defaultValue={value}
        placeholder="10 digits"
        hint="King County parcel number: 6-digit major and 4-digit minor."
        error={state.errors?.pin}
      />
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton>Save PIN</SubmitButton>
        {state.saved && (
          <p role="status" className="text-sm text-accent">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
