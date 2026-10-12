import { desc } from 'drizzle-orm';
import { requireUser } from '@/lib/auth';
import { schema, withUser } from '@/lib/db/client';

export const metadata = { title: 'Deals' };

export default async function DealsPage() {
  const user = await requireUser();
  const deals = await withUser(user.id, (tx) =>
    tx.select().from(schema.deals).orderBy(desc(schema.deals.updatedAt)),
  );

  return (
    <main>
      <h1 className="font-display text-2xl">Deals</h1>
      {deals.length === 0 ? (
        <p className="mt-4 text-muted">No properties yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-panel">
          {deals.map((d) => (
            <li key={d.id} className="p-4">
              {d.address}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
