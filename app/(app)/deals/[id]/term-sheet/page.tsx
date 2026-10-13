import { DealNav } from '@/components/deals/deal-nav';
import { TermSheetForm } from '@/components/term-sheet/term-sheet-form';
import { buttonClass } from '@/components/ui/button';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { formatPrice } from '@/lib/deals/format';
import { Disclaimer } from '@/lib/legal/disclaimer';
import { termSheetDefaults } from '@/lib/term-sheet/defaults';
import { getSavedTermSheet } from '@/lib/term-sheet/queries';
import { dataToForm } from '@/lib/term-sheet/schema';
import { getDeal } from '../../data';
import { saveTermSheetAction } from './actions';

export const metadata = { title: 'Term sheet' };

export default async function TermSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDeal(user.id, id);
  const saved = await withUser(user.id, (tx) => getSavedTermSheet(tx, id));
  const initial = dataToForm(saved?.data ?? termSheetDefaults(deal));

  return (
    <main>
      <DealNav dealId={id} active="term-sheet" />

      <section className="mt-6" aria-labelledby="ts-h">
        <h2 id="ts-h" className="font-display text-xl">
          Term sheet
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          A summary of the terms you are considering, laid out for an attorney to review. It is not a contract and not a
          form.
        </p>
        {saved && (
          <p className="mt-3">
            <a href={`/deals/${id}/term-sheet/pdf`} className={buttonClass('secondary')}>
              Download PDF
            </a>
          </p>
        )}
        <div className="mt-5">
          <TermSheetForm
            action={saveTermSheetAction.bind(null, id)}
            initial={initial}
            listPrice={formatPrice(deal.listPrice)}
          />
        </div>
      </section>

      <Disclaimer kind="term-sheet" />
    </main>
  );
}
