import { CompsList } from '@/components/comps/comps-list';
import { FilterForm } from '@/components/comps/filter-form';
import { ParcelLookup } from '@/components/comps/parcel-lookup';
import { SubjectCard } from '@/components/comps/subject-card';
import { Button } from '@/components/ui/button';
import { DealNav } from '@/components/deals/deal-nav';
import { requireUser } from '@/lib/auth';
import { MIN_COMPS_FOR_RANGE } from '@/lib/comps/codes';
import { int, usd } from '@/lib/comps/format';
import { listCompSets } from '@/lib/comps/mutations';
import { paramsFromJson, paramsToSearch, parseCompParams } from '@/lib/comps/params';
import { getSubject, hasLocation, searchParcels } from '@/lib/comps/query';
import { runComps } from '@/lib/comps/service';
import { statsSentences } from '@/lib/comps/summary';
import { withUser } from '@/lib/db/client';
import { Disclaimer } from '@/lib/legal/disclaimer';
import { getDeal } from '../../data';
import { enterPinAction, saveCompSetAction, selectParcelAction } from './actions';

export const metadata = { title: 'Comps' };

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function CompsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const deal = await getDeal(user.id, id);
  const filters = parseCompParams(sp);
  const qs = paramsToSearch(filters);
  const q = first(sp.q).trim();
  const changing = first(sp.change) === '1';

  const data = await withUser(user.id, async (tx) => {
    const subject = deal.parcelPin ? await getSubject(tx, deal.parcelPin) : null;
    if (!subject || changing) {
      return { subject, hits: q ? await searchParcels(tx, q) : [], report: null, sets: [] };
    }
    const [report, sets] = await Promise.all([runComps(tx, subject, filters), listCompSets(tx, id)]);
    return { subject, hits: [], report, sets };
  });

  const { subject, report } = data;
  const showLookup = !subject || changing;

  return (
    <main>
      <DealNav dealId={id} active="comps" />

      {showLookup ? (
        <>
          {deal.parcelPin && !subject && (
            <p role="alert" className="mt-6 text-sm text-danger">
              The saved PIN {deal.parcelPin} is not in the King County data we have loaded. Search again or enter another
              PIN.
            </p>
          )}
          <ParcelLookup
            query={q}
            defaultQuery={deal.address}
            hits={data.hits}
            searched={q.length > 0}
            selectAction={selectParcelAction.bind(null, id)}
            pinAction={enterPinAction.bind(null, id)}
          />
          {subject && (
            <p className="mt-4 text-sm">
              <a href={`/deals/${id}/comps`} className="text-accent underline-offset-4 hover:underline">
                Keep the current parcel
              </a>
            </p>
          )}
        </>
      ) : (
        subject &&
        report && (
          <>
            <SubjectCard subject={subject} changeHref={`/deals/${id}/comps?change=1`} />
            <FilterForm params={filters} canRadius={hasLocation(subject)} />

            <section className="mt-6" aria-labelledby="results-h">
              <h2 id="results-h" className="font-display text-xl">
                Comparable recorded sales
              </h2>

              {report.result.unavailable ? (
                <p className="mt-2 text-sm text-muted">{report.result.unavailable}</p>
              ) : (
                <>
                  {report.result.locationFellBack && (
                    <p className="mt-2 text-sm text-muted">
                      This parcel has no map location, so the same assessor area and sub-area was used instead of a radius.
                    </p>
                  )}
                  <div className="mt-3 rounded-md border border-line bg-panel p-4" aria-live="polite">
                    {statsSentences(report.stats, subject.sqFtLiving).map((line) => (
                      <p key={line} className="text-base">
                        {line}
                      </p>
                    ))}
                    {report.stats.range && (
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        The range is arithmetic only: the middle half of price per living sq ft, multiplied by this
                        home&apos;s living area and rounded to the nearest $5,000. It is not a valuation. A range is
                        shown when at least {MIN_COMPS_FOR_RANGE} comparable sales are found.
                      </p>
                    )}
                  </div>

                  <details className="mt-3 text-sm">
                    <summary className="flex min-h-11 cursor-pointer items-center font-medium">Method</summary>
                    <p className="leading-relaxed text-muted">{report.method}</p>
                  </details>

                  {report.result.comps.length > 0 && (
                    <>
                      <CompsList comps={report.result.comps} showDistance={filters.location.kind === 'radius' && !report.result.locationFellBack} />
                      <form action={saveCompSetAction.bind(null, id)} className="mt-4">
                        <input type="hidden" name="qs" value={qs} />
                        <Button type="submit" variant="secondary">
                          Save this set
                        </Button>
                      </form>
                    </>
                  )}
                </>
              )}
            </section>

            {data.sets.length > 0 && (
              <section className="mt-8" aria-labelledby="saved-h">
                <h2 id="saved-h" className="font-display text-xl">
                  Saved sets
                </h2>
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-md border border-line bg-panel">
                  {data.sets.map((s) => {
                    const r = (s.results ?? {}) as {
                      stats?: { count?: number; range?: { low: number; high: number } | null };
                      subjectSqFt?: number | null;
                    };
                    const when = s.createdAt.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      timeZone: 'America/Los_Angeles',
                    });
                    return (
                      <li key={s.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-medium">Saved {when}</p>
                          <p className="text-muted">
                            {r.stats?.count ?? 0} comparable sales
                            {r.stats?.range ? `, range ${usd(r.stats.range.low)}–${usd(r.stats.range.high)}` : ''}
                            {r.subjectSqFt ? ` for ${int(r.subjectSqFt)} sq ft` : ''}
                          </p>
                        </div>
                        <a
                          href={`/deals/${id}/comps?${paramsToSearch(paramsFromJson(s.params))}`}
                          className="inline-flex min-h-11 items-center text-accent underline-offset-4 hover:underline"
                        >
                          Open these filters
                        </a>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-xs text-muted">
                  Saved sets keep the sales as they were on the date shown. Opening the filters runs them again on current
                  data.
                </p>
              </section>
            )}
          </>
        )
      )}

      <Disclaimer kind="comps" />
    </main>
  );
}

