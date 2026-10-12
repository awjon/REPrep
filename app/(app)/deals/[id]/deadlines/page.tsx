import { CustomDeadlineForm } from '@/components/deals/custom-deadline-form';
import { DealNav } from '@/components/deals/deal-nav';
import { DeadlineRow } from '@/components/deals/deadline-row';
import { ScheduleForm } from '@/components/deals/schedule-form';
import { requireUser } from '@/lib/auth';
import { Disclaimer } from '@/lib/legal/disclaimer';
import { pacificInputValue } from '@/lib/deals/format';
import { WA_DEFAULTS } from '@/lib/deadlines/rules/wa-defaults';
import { getDeal, listDealDates } from '../../data';
import {
  addCustomAction,
  deleteCustomAction,
  pinDateAction,
  restoreComputedAction,
  saveScheduleAction,
  toggleDoneAction,
} from './actions';

export const metadata = { title: 'Deadlines' };

export default async function DeadlinesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDeal(user.id, id);
  const dates = await listDealDates(user.id, id);
  const now = new Date();

  const overrides = deal.periodOverrides;
  const initial: Record<string, string> = {
    acceptanceAt: deal.mutualAcceptanceAt ? pacificInputValue(deal.mutualAcceptanceAt) : '',
    form17ReceivedOn: deal.form17ReceivedOn ?? '',
    closingDate: deal.closingDate ?? '',
    possessionDays: String(deal.possessionDaysAfterClosing),
  };
  for (const d of WA_DEFAULTS) {
    const o = overrides[d.kind];
    initial[`period_${d.kind}`] = typeof o === 'number' ? String(o) : '';
  }
  const noneKinds = WA_DEFAULTS.filter((d) => overrides[d.kind] === null).map((d) => d.kind);

  return (
    <main>
      <DealNav dealId={id} active="deadlines" />

      <section className="mt-6" aria-labelledby="schedule-h">
        <h2 id="schedule-h" className="font-display text-xl">
          Schedule
        </h2>
        {dates.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No dates yet. Enter the mutual acceptance date below to compute the schedule.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
            {dates.map((row) => (
              <DeadlineRow
                key={row.id}
                row={row}
                now={now}
                toggleDone={toggleDoneAction.bind(null, id, row.id, row.completedAt === null)}
                pinDate={pinDateAction.bind(null, id, row.id)}
                restoreComputed={restoreComputedAction.bind(null, id, row.id)}
                deleteCustom={deleteCustomAction.bind(null, id, row.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <details className="mt-8 rounded-md border border-line bg-panel" open={!deal.mutualAcceptanceAt}>
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-display text-lg">
          Contract inputs
        </summary>
        <div className="border-t border-line p-4">
          <ScheduleForm action={saveScheduleAction.bind(null, id)} initial={initial} noneKinds={noneKinds} />
        </div>
      </details>

      <details className="mt-4 rounded-md border border-line bg-panel">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-display text-lg">
          Add your own deadline
        </summary>
        <div className="border-t border-line p-4">
          <CustomDeadlineForm action={addCustomAction.bind(null, id)} />
        </div>
      </details>

      <Disclaimer kind="deadlines" />
    </main>
  );
}
