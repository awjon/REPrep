import Link from 'next/link';
import { DealForm } from '@/components/deals/deal-form';
import { requireUser } from '@/lib/auth';
import { createDealAction } from '../actions';

export const metadata = { title: 'New property' };

export default async function NewDealPage() {
  await requireUser();
  return (
    <main>
      <Link href="/deals" className="text-sm text-muted underline-offset-4 hover:underline">
        All properties
      </Link>
      <h1 className="mt-2 font-display text-2xl">New property</h1>
      <div className="mt-6">
        <DealForm
          action={createDealAction}
          initial={{ address: '', parcelPin: '', listPrice: '', notes: '' }}
          submitLabel="Add property"
        />
      </div>
    </main>
  );
}
