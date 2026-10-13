import type { LotFlag } from '@/lib/lot/flags';

const tone = {
  note: 'border-line bg-panel',
  check: 'border-accent/50 bg-accent/10',
} as const;

export function FlagList({ flags }: { flags: LotFlag[] }) {
  return (
    <ul className="mt-3 space-y-2">
      {flags.map((f) => (
        <li key={f.id} className={`rounded-md border p-3 text-sm leading-relaxed ${tone[f.tone]}`} data-tone={f.tone}>
          <span className="mr-2 inline-block rounded-full border border-line bg-white px-2 py-0.5 text-xs font-medium text-muted dark:bg-panel">
            {f.tone === 'check' ? 'Check' : 'Note'}
          </span>
          {f.text}
          {f.links && (
            <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
              {f.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline underline-offset-4"
                >
                  {l.label}
                </a>
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
