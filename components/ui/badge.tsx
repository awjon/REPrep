import { statusLabel, type DealStatus } from '@/lib/deals/format';

const tone: Record<DealStatus, string> = {
  watching: 'border-line text-muted',
  offer_prep: 'border-accent/40 bg-accent/10 text-accent',
  under_contract: 'border-accent bg-accent text-white',
  closed: 'border-line bg-line/50 text-ink',
  terminated: 'border-danger/40 bg-danger/10 text-danger',
};

export function StatusBadge({ status }: { status: DealStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${tone[status]}`}>
      {statusLabel(status)}
    </span>
  );
}
