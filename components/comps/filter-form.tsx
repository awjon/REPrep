import { SelectField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { MONTH_OPTIONS, RADIUS_OPTIONS, SQFT_OPTIONS, YEAR_WINDOW } from '@/lib/comps/params';
import type { CompParams } from '@/lib/comps/types';

export function FilterForm({ params, canRadius }: { params: CompParams; canRadius: boolean }) {
  const loc = params.location.kind === 'area' ? 'area' : String(params.location.miles);
  return (
    <form method="get" className="mt-6 rounded-md border border-line bg-panel p-4" aria-labelledby="filters-h">
      <h2 id="filters-h" className="font-display text-xl">
        Filters
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        <SelectField label="Sold within" name="months" defaultValue={String(params.months)}>
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Last {m} months
            </option>
          ))}
        </SelectField>
        <SelectField label="Living area" name="sqft" defaultValue={String(params.sqftPct)}>
          {SQFT_OPTIONS.map((p) => (
            <option key={p} value={p}>
              Within {p}% of this home
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Location"
          name="loc"
          defaultValue={loc}
          hint={canRadius ? undefined : 'Radius needs a map location, which this parcel does not have.'}
        >
          <option value="area">Same assessor area and sub-area</option>
          {canRadius &&
            RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>
                Within {r} {r === 1 ? 'mile' : 'miles'}
              </option>
            ))}
        </SelectField>
      </div>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="yr" value="1" defaultChecked={params.yearWindow !== null} className="size-5" />
          Year built within {YEAR_WINDOW} years of this home
        </label>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" name="beds" value="1" defaultChecked={params.sameBeds} className="size-5" />
          Bedrooms within 1 of this home
        </label>
      </div>
      <div className="mt-3">
        <Button type="submit">Update results</Button>
      </div>
    </form>
  );
}
