import Link from 'next/link';

const ITEMS = [
  { key: 'overview', label: 'Overview', href: (id: string) => `/deals/${id}` },
  { key: 'deadlines', label: 'Deadlines', href: (id: string) => `/deals/${id}/deadlines` },
  { key: 'documents', label: 'Documents', href: (id: string) => `/deals/${id}/documents` },
  { key: 'comps', label: 'Comps', href: (id: string) => `/deals/${id}/comps` },
  { key: 'lot', label: 'Lot', href: (id: string) => `/deals/${id}/lot` },
  { key: 'term-sheet', label: 'Term sheet', href: (id: string) => `/deals/${id}/term-sheet` },
] as const;

export function DealNav({ dealId, active }: { dealId: string; active: (typeof ITEMS)[number]['key'] }) {
  return (
    <nav aria-label="Property sections" className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 [scrollbar-width:none]">
      {ITEMS.map((i) => (
        <Link
          key={i.key}
          href={i.href(dealId)}
          aria-current={i.key === active ? 'page' : undefined}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium ${
            i.key === active ? 'border-accent text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
