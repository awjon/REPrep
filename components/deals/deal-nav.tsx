import Link from 'next/link';

const ITEMS = [
  { key: 'overview', label: 'Overview', href: (id: string) => `/deals/${id}` },
  { key: 'deadlines', label: 'Deadlines', href: (id: string) => `/deals/${id}/deadlines` },
] as const;

export function DealNav({ dealId, active }: { dealId: string; active: (typeof ITEMS)[number]['key'] }) {
  return (
    <nav aria-label="Property sections" className="mt-4 flex gap-1 border-b border-line">
      {ITEMS.map((i) => (
        <Link
          key={i.key}
          href={i.href(dealId)}
          aria-current={i.key === active ? 'page' : undefined}
          className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-4 text-sm font-medium ${
            i.key === active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
