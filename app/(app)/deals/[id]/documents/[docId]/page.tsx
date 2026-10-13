import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DealNav } from '@/components/deals/deal-nav';
import { DeleteDocument } from '@/components/documents/delete-document';
import { ReviewButton } from '@/components/documents/review-button';
import { requireUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { docTypeLabel, formatUsd, SEVERITY_LABELS } from '@/lib/documents/display';
import { reviewErrorMessage } from '@/lib/documents/messages';
import { getDocument } from '@/lib/documents/queries';
import { formatPacificDate } from '@/lib/deals/format';
import { Disclaimer } from '@/lib/legal/disclaimer';
import { latestRunWithFindings } from '@/lib/review/persist';
import { isUuid, getDeal } from '../../../data';
import { deleteDocumentAction } from '../actions';

export const metadata = { title: 'Document review' };

async function deleteAndReturn(dealId: string, docId: string) {
  'use server';
  await deleteDocumentAction(dealId, docId);
  redirect(`/deals/${dealId}/documents`);
}

export default async function DocumentReportPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const user = await requireUser();
  await getDeal(user.id, id);
  if (!isUuid(docId)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const doc = await getDocument(tx, id, docId);
    return doc ? { doc, latest: await latestRunWithFindings(tx, docId) } : null;
  });
  if (!data) notFound();
  const { doc, latest } = data;
  const run = latest?.run ?? null;
  const findings = latest?.findings ?? [];
  const inProgress = run?.status === 'running' || run?.status === 'queued';
  const groups = (['high', 'medium', 'low', 'info'] as const)
    .map((sev) => ({ sev, items: findings.filter((f) => f.severity === sev) }))
    .filter((g) => g.items.length > 0);

  return (
    <main>
      <DealNav dealId={id} active="documents" />
      <div className="mt-6 space-y-6">
        <Link href={`/deals/${id}/documents`} className="text-sm text-muted underline-offset-4 hover:underline">
          All documents
        </Link>
        <header>
          <h2 className="break-words font-display text-xl">{doc.filename}</h2>
          <p className="mt-1 text-sm text-muted">
            {docTypeLabel(doc.docType)}
            {doc.pageCount ? ` · ${doc.pageCount} pages` : ''} · Added {formatPacificDate(doc.createdAt)}
          </p>
        </header>

        <ReviewButton documentId={doc.id} hasReview={run?.status === 'done'} disabled={inProgress} />
        {inProgress && (
          <p className="text-sm text-muted">A review is in progress. Refresh this page in a minute to see the result.</p>
        )}

        {run?.status === 'failed' && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm">
            {reviewErrorMessage(run.error)}
          </p>
        )}

        {doc.isScanned && (
          <p role="note" className="rounded-md border border-line bg-panel p-3 text-sm">
            This looks like a scanned document. Scanned pages may be read less reliably.
          </p>
        )}

        {run?.status === 'done' && (
          <section aria-labelledby="findings-heading" className="space-y-6">
            <h2 id="findings-heading" className="font-display text-lg">
              Findings
            </h2>
            <p className="mt-1 text-sm text-muted">Grouped by how prominently each item appears in the document, not by how much it matters to you.</p>
            {groups.length === 0 && <p className="text-sm text-muted">No findings with a matching page citation.</p>}
            {groups.map((g) => (
              <div key={g.sev} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
                  {SEVERITY_LABELS[g.sev]} ({g.items.length})
                </h3>
                <ul className="space-y-3">
                  {g.items.map((f) => (
                    <li key={f.id} className="rounded-md border border-line bg-panel p-4">
                      <p className="text-xs font-medium text-muted">
                        {f.category} · Page {f.page}
                      </p>
                      <p className="mt-1">{f.summary}</p>
                      <blockquote className="mt-3 border-l-2 border-line pl-3 text-sm italic text-muted">{f.quote}</blockquote>
                      {!f.quoteVerified && (
                        <p className="mt-1 text-xs text-muted">Quote not machine-checked (scanned page)</p>
                      )}
                      <p className="mt-3 text-sm">
                        <span className="font-medium">Question to ask: </span>
                        {f.questionToAsk}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="text-xs text-muted">
              {run.pagesReviewed} {run.pagesReviewed === 1 ? 'page' : 'pages'} reviewed · {run.findingsDropped} findings not shown because they could
              not be matched to the document · cost {formatUsd(run.costUsd)} · prompt {run.promptVersion}
            </p>
          </section>
        )}

        <DeleteDocument action={deleteAndReturn.bind(null, id, doc.id)} label="Delete this document" />
      </div>
      <Disclaimer kind="review" />
    </main>
  );
}
