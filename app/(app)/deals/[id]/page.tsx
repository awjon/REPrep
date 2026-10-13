import { DealForm } from '@/components/deals/deal-form';
import { DealNav } from '@/components/deals/deal-nav';
import { SubmitButton } from '@/components/ui/submit-button';
import { requireUser } from '@/lib/auth';
import { deleteDealAction, updateDealAction } from '../actions';
import { getDeal } from '../data';

export const metadata = { title: 'Property' };

export default async function DealOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDeal(user.id, id);

  return (
    <main>
      <DealNav dealId={id} active="overview" />
      <div className="mt-6">
        <DealForm
          action={updateDealAction.bind(null, id)}
          initial={{
            address: deal.address,
            parcelPin: deal.parcelPin ?? '',
            listPrice: deal.listPrice == null ? '' : String(deal.listPrice),
            notes: deal.notes ?? '',
            status: deal.status,
          }}
          showStatus
          submitLabel="Save changes"
        />
      </div>

      <details className="group mt-10 rounded-md border border-line bg-panel">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium text-danger">
          Delete property
        </summary>
        <form action={deleteDealAction.bind(null, id)} className="space-y-3 border-t border-line p-4">
          <p className="text-sm">
            This removes the property, its notes, its deadlines, its uploaded documents and their reviews, and saved comparable sales and term sheet. It cannot be undone.
          </p>
          <SubmitButton variant="danger" pendingLabel="Deleting…">
            Yes, delete this property
          </SubmitButton>
        </form>
      </details>
    </main>
  );
}
