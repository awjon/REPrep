import 'server-only';

import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { deals, termSheets } from '@/lib/db/schema';
import { parseTermSheetForm, type TermSheetData } from './schema';

/** Validates form-shaped input and upserts the deal's single term sheet. Throws on invalid input. */
export async function saveTermSheet(tx: Tx, dealId: string, raw: unknown): Promise<TermSheetData> {
  const parsed = parseTermSheetForm(raw);
  if (!parsed.ok) throw new Error(`invalid term sheet: ${Object.keys(parsed.errors).join(', ')}`);
  const [deal] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
  if (!deal) throw new Error('deal not found');
  const values = { dealId, data: parsed.data, closingDate: parsed.data.closingDate };
  await tx
    .insert(termSheets)
    .values(values)
    .onConflictDoUpdate({
      target: termSheets.dealId,
      set: { data: values.data, closingDate: values.closingDate, updatedAt: new Date() },
    });
  return parsed.data;
}
