'use client';

import { useActionState } from 'react';
import type { FormState } from '@/components/deals/form-state';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';

export function PinForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <TextField
        label="Or enter the 10-digit parcel number (PIN)"
        name="pin"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        defaultValue={state.values?.pin}
        placeholder="1234567890"
        error={state.errors?.pin}
        required
      />
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <SubmitButton variant="secondary" pendingLabel="Saving…">
        Use this parcel
      </SubmitButton>
    </form>
  );
}
