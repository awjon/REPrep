import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { requireUser } from '@/lib/auth';
import { formatPacific, formatPrice, relativeDue } from '@/lib/deals/format';
import { listDealsWithNext } from './data';

export const metadata = { title: 'Properties' };

export default async function DealsPage() {
  const user = await requireUser();
  const rows = await listDealsWithNext(user.id);
  const now = new Date();

  return (
    <main>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl">Properties</h1>
        {rows.length > 0 && (
          <Link href="/deals/new" className={buttonClass('primary')}>
            New property
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <section className="mt-6 rounded-md border border-dashed border-line bg-panel p-6 text-center">
          <h2 className="font-display text-xl">Add your first property</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Keep the address, notes and every contract date for a home in one place.
          </p>
          <Link href="/deals/new" className={buttonClass('primary', 'mt-4')}>
            New property
          </Link>
        </section>
      ) : (
        <ul className="mt-6 divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
          {rows.map(({ deal, next }) => (
            <li key={deal.id}>
              <Link href={`/deals/${deal.id}`} className="block min-h-11 p-4 hover:bg-line/30">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{deal.address}</span>
                  <StatusBadge status={deal.status} />
                </div>
                {deal.listPrice != null && (
                  <p className="tabular mt-1 text-sm text-muted">Listed at {formatPrice(deal.listPrice)}</p>
                )}
                <p className="mt-1 text-sm text-muted">
                  {next ? (
                    <>
                      Next: {next.label} · <span className="tabular">{formatPacific(next.dueAt)}</span> (
                      {relativeDue(next.dueAt, now)}) ·{' '}
                      {next.isOverridden ? 'from your contract' : next.kind === 'custom' ? 'added by you' : 'computed, confirm against your contract'}
                    </>
                  ) : (
                    'No upcoming deadlines'
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
