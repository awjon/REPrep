import Link from 'next/link';
import { cache } from 'react';
import { DealNav } from '@/components/deals/deal-nav';
import { FlagList } from '@/components/lot/flag-list';
import { PinForm } from '@/components/lot/pin-form';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { lookupEca } from '@/lib/lot/eca';
import { ecaFlags, isSeattle, lotFlags, type EcaResult } from '@/lib/lot/flags';
import { loadLotFacts } from '@/lib/lot/queries';
import { Disclaimer } from '@/lib/legal/disclaimer';
import { getDeal } from '../../data';
import { savePinAction } from './actions';

export const metadata = { title: 'Lot screen' };

const ecaOnce = cache((lat: number, lon: number) => lookupEca(lat, lon));

export default async function LotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDeal(user.id, id);
  const pin = deal.parcelPin;
  const facts = pin ? await withUser(user.id, (tx) => loadLotFacts(tx, pin)) : null;

  let eca: EcaResult | null = null;
  let ecaSkipped = false;
  if (facts && facts.lat != null && facts.lon != null) {
    if (isSeattle(facts.district)) eca = await ecaOnce(facts.lat, facts.lon);
    else ecaSkipped = true;
  }

  return (
    <main>
      <DealNav dealId={id} active="lot" />

      {!pin && (
        <section className="mt-6" aria-labelledby="pin-h">
          <h2 id="pin-h" className="font-display text-xl">
            Parcel
          </h2>
          <p className="mt-2 text-sm text-muted">
            This property has no parcel PIN yet.{' '}
            <Link href={`/deals/${id}/comps`} className="text-accent underline underline-offset-4">
              Find the parcel on the Comps page
            </Link>
            , or enter the 10-digit PIN here.
          </p>
          <div className="mt-4">
            <PinForm action={savePinAction.bind(null, id)} initial="" />
          </div>
        </section>
      )}

      {pin && !facts && (
        <section className="mt-6" aria-labelledby="pin-h">
          <h2 id="pin-h" className="font-display text-xl">
            Parcel not found
          </h2>
          <p className="mt-2 text-sm text-muted">
            No King County parcel on record for PIN {pin}. Check the number, or{' '}
            <Link href={`/deals/${id}/comps`} className="text-accent underline underline-offset-4">
              find the parcel on the Comps page
            </Link>
            .
          </p>
          <div className="mt-4">
            <PinForm action={savePinAction.bind(null, id)} initial={pin} />
          </div>
        </section>
      )}

      {facts && (
        <>
          <section className="mt-6" aria-labelledby="flags-h">
            <h2 id="flags-h" className="font-display text-xl">
              Parcel facts and flags
            </h2>
            <p className="mt-1 text-sm text-muted">
              From King County Assessor records for PIN {facts.pin}. Flags describe what the record says. They are not a
              determination of what can be built.
            </p>
            <FlagList flags={lotFlags(facts)} />
          </section>

          <section className="mt-8" aria-labelledby="eca-h">
            <h2 id="eca-h" className="font-display text-xl">
              Environmentally critical areas
            </h2>
            {eca ? (
              <FlagList flags={ecaFlags(eca)} />
            ) : (
              <p className="mt-2 text-sm text-muted">
                {ecaSkipped
                  ? 'Overlay layers are published by the City of Seattle and were not checked for a parcel outside Seattle.'
                  : 'Overlays were not checked because the parcel has no coordinates on record.'}
              </p>
            )}
          </section>

          <details className="mt-8 rounded-md border border-line bg-panel">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-display text-lg">
              Change parcel PIN
            </summary>
            <div className="border-t border-line p-4">
              <PinForm action={savePinAction.bind(null, id)} initial={pin ?? ''} />
            </div>
          </details>
        </>
      )}

      <Disclaimer kind="lot" />
    </main>
  );
}
