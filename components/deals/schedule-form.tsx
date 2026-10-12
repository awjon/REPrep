'use client';

import { useActionState } from 'react';
import { TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { WA_DEFAULTS } from '@/lib/deadlines/rules/wa-defaults';
import type { FormState } from './form-state';

export type ScheduleValues = Record<string, string>;

export function ScheduleForm({
  action,
  initial,
  noneKinds,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: ScheduleValues;
  /** Contingencies currently saved as "not in my contract". */
  noneKinds: string[];
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...initial, ...state.values };
  const e = state.errors ?? {};
  const isNone = (kind: string) => (state.values ? state.values[`none_${kind}`] === 'on' : noneKinds.includes(kind));

  return (
    <form action={formAction} className="space-y-5">
      <TextField
        label="Mutual acceptance date and time"
        name="acceptanceAt"
        type="datetime-local"
        defaultValue={v.acceptanceAt}
        hint="Pacific time. Periods start counting the day after this."
        error={e.acceptanceAt}
      />
      <TextField
        label="Form 17 received on (optional)"
        name="form17ReceivedOn"
        type="date"
        defaultValue={v.form17ReceivedOn}
        hint="The seller disclosure window counts from this date. If blank, the acceptance date is used."
        error={e.form17ReceivedOn}
      />
      <TextField
        label="Closing date (optional)"
        name="closingDate"
        type="date"
        defaultValue={v.closingDate}
        error={e.closingDate}
      />
      <TextField
        label="Possession, days after closing"
        name="possessionDays"
        type="number"
        inputMode="numeric"
        min={0}
        max={365}
        defaultValue={v.possessionDays}
        error={e.possessionDays}
      />

      <fieldset className="space-y-5 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Contingency periods</legend>
        {WA_DEFAULTS.map((d) => (
          <div key={d.kind} className="space-y-2">
            <TextField
              label={`${d.label}, days`}
              name={`period_${d.kind}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={v[`period_${d.kind}`]}
              placeholder={String(d.days)}
              hint={`Default ${d.days} days. ${d.note}`}
              error={e[`period_${d.kind}`]}
            />
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name={`none_${d.kind}`}
                defaultChecked={isNone(d.kind)}
                className="size-5 accent-[var(--accent)]"
              />
              Not in my contract
            </label>
          </div>
        ))}
      </fieldset>

      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton>Save and compute dates</SubmitButton>
        {state.saved && (
          <p role="status" className="text-sm text-accent">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
