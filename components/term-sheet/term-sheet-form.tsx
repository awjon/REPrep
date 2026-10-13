'use client';

import { useActionState } from 'react';
import type { FormState } from '@/components/deals/form-state';
import { SelectField, TextAreaField, TextField } from '@/components/ui/field';
import { SubmitButton } from '@/components/ui/submit-button';
import { FINANCING_LABELS, FINANCING_TYPES } from '@/lib/term-sheet/schema';

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="size-5 accent-[var(--accent)]" />
      {label}
    </label>
  );
}

const Days = ({ name, v, e }: { name: string; v: Record<string, string>; e: Record<string, string> }) => (
  <TextField
    label="Days"
    name={name}
    type="number"
    inputMode="numeric"
    min={1}
    max={60}
    defaultValue={v[name]}
    error={e[name]}
  />
);

export function TermSheetForm({
  action,
  initial,
  listPrice,
}: {
  action: (prev: FormState, form: FormData) => Promise<FormState>;
  initial: Record<string, string>;
  /** Shown as a placeholder only; never a value. */
  listPrice: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const v = { ...initial, ...state.values };
  const e = state.errors ?? {};
  const on = (k: string) => v[k] === 'on';
  // Re-key on submit results so checkbox defaults follow the submitted values.
  const formKey = state.values ? 'submitted' : 'initial';

  return (
    <form action={formAction} key={formKey} className="space-y-6">
      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Property</legend>
        <TextField label="Address" name="address" defaultValue={v.address} error={e.address} />
        <TextField label="Parcel PIN (optional)" name="pin" inputMode="numeric" defaultValue={v.pin} error={e.pin} />
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Price and earnest money</legend>
        <TextField
          label="Price under consideration (whole dollars)"
          name="price"
          inputMode="numeric"
          defaultValue={v.price}
          placeholder={listPrice ? `List price ${listPrice}` : ''}
          hint="Your own figure. It is left blank on purpose; the list price is not copied here."
          error={e.price}
        />
        <TextField label="Earnest money (whole dollars)" name="earnestMoney" inputMode="numeric" defaultValue={v.earnestMoney} error={e.earnestMoney} />
        <TextField label="Seller credit requested (optional)" name="sellerCredit" inputMode="numeric" defaultValue={v.sellerCredit} error={e.sellerCredit} />
        <Check name="escalation_enabled" label="Include escalation in this summary" checked={on('escalation_enabled')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Escalation increment" name="escalation_increment" inputMode="numeric" defaultValue={v.escalation_increment} error={e.escalation_increment} />
          <TextField label="Escalation cap" name="escalation_cap" inputMode="numeric" defaultValue={v.escalation_cap} error={e.escalation_cap} />
        </div>
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Financing</legend>
        <SelectField label="Type" name="financingType" defaultValue={v.financingType} error={e.financingType}>
          {FINANCING_TYPES.map((t) => (
            <option key={t} value={t}>
              {FINANCING_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <TextField label="Down payment, percent (optional)" name="downPaymentPct" inputMode="decimal" defaultValue={v.downPaymentPct} error={e.downPaymentPct} />
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Contingencies</legend>
        <p className="text-xs leading-relaxed text-muted">
          Starting days come from your deadline inputs and common defaults. Change them to match the terms you are
          considering.
        </p>
        <div className="space-y-2">
          <Check name="inspection_included" label="Inspection" checked={on('inspection_included')} />
          <Days name="inspection_days" v={v} e={e} />
        </div>
        <div className="space-y-2">
          <Check name="financing_included" label="Financing" checked={on('financing_included')} />
          <Days name="financing_days" v={v} e={e} />
        </div>
        <Check name="appraisal_included" label="Appraisal" checked={on('appraisal_included')} />
        <div className="space-y-2">
          <Check name="titleReview_included" label="Title review" checked={on('titleReview_included')} />
          <Days name="titleReview_days" v={v} e={e} />
        </div>
        <Check name="saleOfBuyersHome_included" label="Sale of buyer's home" checked={on('saleOfBuyersHome_included')} />
        <div className="space-y-2">
          <Check name="hoaReview_included" label="HOA document review" checked={on('hoaReview_included')} />
          <Days name="hoaReview_days" v={v} e={e} />
        </div>
        <TextAreaField
          label="Seller disclosure review, note (optional)"
          name="sellerDisclosureNote"
          rows={2}
          defaultValue={v.sellerDisclosureNote}
          hint="The seller disclosure review appears on the PDF as the seller disclosure review period. Add a note for your attorney if useful."
          error={e.sellerDisclosureNote}
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Dates</legend>
        <TextField label="Closing date (optional)" name="closingDate" type="date" defaultValue={v.closingDate} error={e.closingDate} />
        <SelectField label="Possession" name="possessionMode" defaultValue={v.possessionMode} error={e.possessionMode}>
          <option value="on_closing">On closing</option>
          <option value="days_after">Days after closing</option>
        </SelectField>
        <TextField label="Days after closing" name="possessionDays" type="number" inputMode="numeric" min={1} max={90} defaultValue={v.possessionDays} error={e.possessionDays} />
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Included and excluded items</legend>
        <TextAreaField label="Items included, one per line" name="itemsIncluded" rows={3} defaultValue={v.itemsIncluded} error={e.itemsIncluded} />
        <TextAreaField label="Items excluded, one per line" name="itemsExcluded" rows={3} defaultValue={v.itemsExcluded} error={e.itemsExcluded} />
      </fieldset>

      <fieldset className="space-y-4 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium">Notes and questions for the attorney</legend>
        <TextAreaField label="Notes" name="notes" rows={4} defaultValue={v.notes} error={e.notes} />
        <TextAreaField label="Questions, one per line" name="questions" rows={4} defaultValue={v.questions} error={e.questions} />
      </fieldset>

      {state.message && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <div className="flex items-center gap-3">
        <SubmitButton>Save term sheet</SubmitButton>
        {state.saved && (
          <p role="status" className="text-sm text-accent">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
