import { bathsLabel, formatDate, int, usd } from '@/lib/comps/format';
import type { CompRow } from '@/lib/comps/types';

const dash = '—';
const dist = (c: CompRow) => (c.distanceMiles === null ? dash : `${c.distanceMiles.toFixed(2)} mi`);
const ppsf = (c: CompRow) => usd(c.salePrice / c.sqFtLiving);

export function CompsList({ comps, showDistance }: { comps: CompRow[]; showDistance: boolean }) {
  return (
    <>
      <ul className="mt-3 space-y-3 sm:hidden" aria-label="Comparable sales">
        {comps.map((c) => (
          <li key={`${c.exciseTaxNbr}-${c.pin}`} className="rounded-md border border-line bg-panel p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="min-w-0 truncate font-medium">{c.address ?? 'No address on file'}</p>
              <p className="shrink-0 font-medium">{usd(c.salePrice)}</p>
            </div>
            <p className="text-xs text-muted">Recorded {formatDate(c.documentDate)}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <Stat k="Living area" v={`${int(c.sqFtLiving)} sq ft`} />
              <Stat k="Per sq ft" v={ppsf(c)} />
              <Stat k="Beds / baths" v={`${c.bedrooms ?? dash} / ${bathsLabel(c.baths)}`} />
              <Stat k="Year built" v={c.yrBuilt ? String(c.yrBuilt) : dash} />
              {showDistance && <Stat k="Distance" v={dist(c)} />}
            </dl>
          </li>
        ))}
      </ul>

      <div className="mt-3 hidden overflow-x-auto rounded-md border border-line bg-panel sm:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Comparable recorded sales, most recent first</caption>
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Recorded</th>
              <th scope="col" className="px-3 py-2 font-medium">Address</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Price</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Living sq ft</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">$ / sq ft</th>
              <th scope="col" className="px-3 py-2 font-medium">Beds / baths</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Built</th>
              {showDistance && <th scope="col" className="px-3 py-2 text-right font-medium">Distance</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {comps.map((c) => (
              <tr key={`${c.exciseTaxNbr}-${c.pin}`}>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(c.documentDate)}</td>
                <td className="px-3 py-2">{c.address ?? dash}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{usd(c.salePrice)}</td>
                <td className="px-3 py-2 text-right">{int(c.sqFtLiving)}</td>
                <td className="px-3 py-2 text-right">{ppsf(c)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {c.bedrooms ?? dash} / {bathsLabel(c.baths)}
                </td>
                <td className="px-3 py-2 text-right">{c.yrBuilt ?? dash}</td>
                {showDistance && <td className="whitespace-nowrap px-3 py-2 text-right">{dist(c)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
