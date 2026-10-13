import 'server-only';

import { asc, eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { kcParcels, kcResBuildings } from '@/lib/db/schema';
import type { LotFacts } from './flags';

/** Parcel and building facts for a PIN, or null when the PIN is not in the county data. */
export async function loadLotFacts(tx: Tx, pin: string): Promise<LotFacts | null> {
  const [p] = await tx.select().from(kcParcels).where(eq(kcParcels.pin, pin));
  if (!p) return null;
  const b = await tx.select().from(kcResBuildings).where(eq(kcResBuildings.pin, pin)).orderBy(asc(kcResBuildings.bldgNbr));
  return {
    pin: p.pin,
    zoning: p.currentZoning,
    district: p.districtName,
    lotSqFt: p.sqFtLot,
    presentUse: p.presentUse,
    lat: p.lat,
    lon: p.lon,
    buildings: b.map((r) => ({
      livingUnits: r.nbrLivingUnits,
      livingSqFt: r.sqFtTotLiving,
      yearBuilt: r.yrBuilt,
      stories: r.stories == null ? null : Number(r.stories),
    })),
  };
}
