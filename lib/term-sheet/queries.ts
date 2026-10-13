import 'server-only';

import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { termSheets } from '@/lib/db/schema';
import { termSheetDataSchema, type TermSheetData } from './schema';

/** The saved term sheet for a deal, or null if none (or the stored JSON no longer validates). */
export async function getSavedTermSheet(tx: Tx, dealId: string): Promise<{ data: TermSheetData; updatedAt: Date } | null> {
  const [row] = await tx.select().from(termSheets).where(eq(termSheets.dealId, dealId));
  if (!row) return null;
  const parsed = termSheetDataSchema.safeParse(row.data);
  return parsed.success ? { data: parsed.data, updatedAt: row.updatedAt } : null;
}
