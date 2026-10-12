import { Button } from '@/components/ui/button';
import { inputClass } from '@/components/ui/field';
import { formatPacific, pacificDateInputValue, relativeDue } from '@/lib/deals/format';

type Row = {
  id: string;
  kind: string;
  label: string;
  dueAt: Date;
  isOverridden: boolean;
  completedAt: Date | null;
};

type Action = (formData: FormData) => void | Promise<void>;

export function DeadlineRow({
  row,
  now,
  toggleDone,
  pinDate,
  restoreComputed,
  deleteCustom,
}: {
  row: Row;
  now: Date;
  toggleDone: Action;
  pinDate: Action;
  restoreComputed: Action;
  deleteCustom: Action;
}) {
  const done = row.completedAt !== null;
  const relative = relativeDue(row.dueAt, now);
  const urgent = !done && (relative === 'today' || relative === 'passed');
  const custom = row.kind === 'custom';

  return (
    <li className="space-y-3 p-4">
      <div>
        <p className={`font-medium ${done ? 'text-muted line-through' : ''}`}>{row.label}</p>
        <p className="tabular mt-0.5 text-sm">
          {formatPacific(row.dueAt)}
          {!done && (
            <span className={`ml-2 ${urgent ? 'font-medium text-warn' : 'text-muted'}`}>({relative})</span>
          )}
          {done && <span className="ml-2 text-accent">Done</span>}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {custom ? 'Added by you' : row.isOverridden ? 'Date from your contract' : 'Computed — confirm against your contract'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <form action={toggleDone}>
          <Button type="submit" variant="secondary">
            {done ? 'Undo' : 'Mark done'}
          </Button>
        </form>
        {custom && (
          <form action={deleteCustom}>
            <Button type="submit" variant="ghost">
              Delete
            </Button>
          </form>
        )}
        {!custom && row.isOverridden && (
          <form action={restoreComputed}>
            <Button type="submit" variant="ghost">
              Use computed date
            </Button>
          </form>
        )}
      </div>

      {!custom && (
        <details className="rounded-md border border-line">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm text-muted">
            Set exact date from contract
          </summary>
          <form action={pinDate} className="flex flex-wrap items-end gap-2 border-t border-line p-3">
            <div className="min-w-40 flex-1">
              <label htmlFor={`exact-${row.id}`} className="mb-1 block text-xs text-muted">
                Date (due 9:00 pm Pacific)
              </label>
              <input
                id={`exact-${row.id}`}
                name="date"
                type="date"
                required
                defaultValue={pacificDateInputValue(row.dueAt)}
                className={inputClass}
              />
            </div>
            <Button type="submit">Save date</Button>
          </form>
        </details>
      )}
    </li>
  );
}
