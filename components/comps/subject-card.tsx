import { bathsLabel, int } from '@/lib/comps/format';
import type { Subject } from '@/lib/comps/types';
import { hasLocation } from '@/lib/comps/query';

const dash = '—';

export function SubjectCard({ subject, changeHref }: { subject: Subject; changeHref: string }) {
  const facts: [string, string][] = [
    ['Living area', subject.sqFtLiving ? `${int(subject.sqFtLiving)} sq ft` : dash],
    ['Bedrooms', subject.bedrooms !== null ? String(subject.bedrooms) : dash],
    ['Bathrooms', bathsLabel(subject.baths)],
    ['Year built', subject.yrBuilt ? String(subject.yrBuilt) : dash],
    ['Lot', subject.sqFtLot ? `${int(subject.sqFtLot)} sq ft` : dash],
    ['Building grade', subject.grade !== null ? String(subject.grade) : dash],
    [
      'Assessor area',
      subject.area !== null ? `${subject.area}${subject.subArea !== null ? ` / ${subject.subArea}` : ''}` : dash,
    ],
    ['Map location', hasLocation(subject) ? 'Available' : 'Not available'],
  ];
  return (
    <section className="mt-6 rounded-md border border-line bg-panel p-4" aria-labelledby="subject-h">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="subject-h" className="font-display text-xl">
            This home
          </h2>
          <p className="truncate text-sm text-muted">
            {subject.address ?? 'No address on file'} · PIN {subject.pin}
          </p>
        </div>
        <a href={changeHref} className="shrink-0 text-sm text-accent underline-offset-4 hover:underline">
          Change parcel
        </a>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
