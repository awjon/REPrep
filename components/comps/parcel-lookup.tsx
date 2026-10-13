import type { FormState } from '@/components/deals/form-state';
import { TextField } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import type { ParcelHit } from '@/lib/comps/types';
import { PinForm } from './pin-form';

export function ParcelLookup({
  query,
  hits,
  searched,
  selectAction,
  pinAction,
  defaultQuery,
}: {
  query: string;
  hits: ParcelHit[];
  searched: boolean;
  selectAction: (pin: string) => Promise<void>;
  pinAction: (prev: FormState, form: FormData) => Promise<FormState>;
  defaultQuery: string;
}) {
  return (
    <section className="mt-6 space-y-6" aria-labelledby="lookup-h">
      <div>
        <h2 id="lookup-h" className="font-display text-xl">
          Find the parcel
        </h2>
        <p className="mt-1 text-sm text-muted">
          Comparable sales are selected from King County records, so the property needs to be matched to its parcel.
        </p>
      </div>

      <form method="get" className="space-y-3">
        <TextField
          label="Street address"
          name="q"
          defaultValue={query || defaultQuery}
          placeholder="1234 Alki Ave SW"
          hint="Street number and name. Avenue, Street and compass words are matched in their short forms."
          autoComplete="off"
        />
        <input type="hidden" name="change" value="1" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {searched && (
        <div aria-live="polite">
          {hits.length === 0 ? (
            <p className="text-sm text-muted">No parcels matched that address. Try fewer words, or enter the PIN below.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
              {hits.map((h) => (
                <li key={h.pin} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h.address ?? 'No address on file'}</p>
                    <p className="text-xs text-muted">
                      {h.zip ? `${h.zip} · ` : ''}PIN {h.pin}
                    </p>
                  </div>
                  <form action={selectAction.bind(null, h.pin)}>
                    <Button type="submit" variant="secondary">
                      Use
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <PinForm action={pinAction} />
    </section>
  );
}
