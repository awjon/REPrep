import Link from 'next/link';
import { DealNav } from '@/components/deals/deal-nav';
import { DeleteDocument } from '@/components/documents/delete-document';
import { UploadForm } from '@/components/documents/upload-form';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { docTypeLabel, reviewStatusLabel } from '@/lib/documents/display';
import { listDocumentsWithStatus } from '@/lib/documents/queries';
import { formatPacificDate } from '@/lib/deals/format';
import { Disclaimer } from '@/lib/legal/disclaimer';
import { getDeal } from '../../data';
import { deleteDocumentAction } from './actions';

export const metadata = { title: 'Documents' };

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await getDeal(user.id, id);
  const rows = await withUser(user.id, (tx) => listDocumentsWithStatus(tx, id));

  return (
    <main>
      <DealNav dealId={id} active="documents" />
      <div className="mt-6 space-y-8">
        <section aria-labelledby="docs-heading">
          <h2 id="docs-heading" className="font-display text-lg">
            Documents
          </h2>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-muted">
              No documents yet. Add a seller disclosure, inspection report, title commitment or HOA documents below.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-panel">
              {rows.map(({ doc, run, findingCount }) => (
                <li key={doc.id} className="px-4 py-3">
                  <Link href={`/deals/${id}/documents/${doc.id}`} className="font-medium underline-offset-4 hover:underline">
                    {doc.filename}
                  </Link>
                  <p className="mt-1 text-sm text-muted">
                    {docTypeLabel(doc.docType)}
                    {doc.pageCount ? ` · ${doc.pageCount} pages` : ''} · Added {formatPacificDate(doc.createdAt)} ·{' '}
                    {reviewStatusLabel(run, findingCount)}
                  </p>
                  <DeleteDocument action={deleteDocumentAction.bind(null, id, doc.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <UploadForm dealId={id} />
      </div>
      <Disclaimer kind="review" />
    </main>
  );
}
