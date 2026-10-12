'use client';

import { useActionState } from 'react';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import type { FormState } from './form-state';

export function CustomDeadlineForm({ action }: { action: (prev: FormState, form: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const e = state.errors ?? {};
  return (
    <form action={formAction} className="space-y-4">
      <TextField label="Label" name="label" defaultValue={state.values?.label} placeholder="Final walkthrough" error={e.label} required />
      <TextField
        label="Date"
        name="date"
        type="date"
        defaultValue={state.values?.date}
        hint="Due at 9:00 pm Pacific."
        error={e.date}
        required
      />
      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <SubmitButton variant="secondary" pendingLabel="Adding…">
        Add deadline
      </SubmitButton>
    </form>
  );
}
