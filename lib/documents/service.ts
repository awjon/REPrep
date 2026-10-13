// Upload finalize and delete, with storage injected so the ownership rules can be tested
// against the real local database. All data access is through withUser (RLS).

import { eq } from 'drizzle-orm';
import type { Tx } from '@/lib/db/rls';
import { deals, documents } from '@/lib/db/schema';
import { isPdf } from '@/lib/review/pdf';
import { cleanFilename, MAX_UPLOAD_BYTES, pathBelongsTo, type UploadDocType } from './validation';

export type StorageDeps = {
  objectSize: (path: string) => Promise<number | null>;
  downloadPdf: (path: string) => Promise<Uint8Array>;
  removeObject: (path: string) => Promise<void>;
};
export type ServiceDeps = {
  withUser: <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  storage: StorageDeps;
};

export type FinalizeResult = { ok: true; documentId: string } | { ok: false; error: string };

export async function finalizeDocument(
  deps: ServiceDeps,
  userId: string,
  dealId: string,
  input: { path: string; filename: string; docType: UploadDocType },
): Promise<FinalizeResult> {
  // Not this user's path: refuse without touching the object (it is not theirs to remove).
  if (!pathBelongsTo(input.path, userId, dealId)) return { ok: false, error: 'That upload does not belong to this property.' };

  const discard = async (error: string): Promise<FinalizeResult> => {
    try {
      await deps.storage.removeObject(input.path);
    } catch {
      /* best effort; the path is private and unreferenced */
    }
    return { ok: false, error };
  };

  const visible = await deps.withUser(userId, async (tx) => {
    const [d] = await tx.select({ id: deals.id }).from(deals).where(eq(deals.id, dealId));
    return Boolean(d);
  });
  if (!visible) return discard('That property could not be found.');

  const size = await deps.storage.objectSize(input.path);
  if (size == null) return { ok: false, error: 'The upload did not arrive. Try again.' };
  if (size <= 0 || size > MAX_UPLOAD_BYTES) return discard('That file is empty or larger than 30 MB.');

  let bytes: Uint8Array;
  try {
    bytes = await deps.storage.downloadPdf(input.path);
  } catch {
    return { ok: false, error: 'The upload could not be checked. Try again.' };
  }
  if (!isPdf(bytes)) return discard('That file is not a PDF.');

  const filename = cleanFilename(input.filename) || 'document.pdf';
  const [row] = await deps.withUser(userId, (tx) =>
    tx
      .insert(documents)
      .values({ dealId, storagePath: input.path, filename, docType: input.docType, sizeBytes: size })
      .returning({ id: documents.id }),
  );
  return { ok: true, documentId: row!.id };
}

/** Hard delete: the object first (after the RLS ownership check), then the row and its runs. */
export async function deleteDocument(deps: ServiceDeps, userId: string, documentId: string): Promise<boolean> {
  const doc = await deps.withUser(userId, async (tx) => {
    const [d] = await tx
      .select({ storagePath: documents.storagePath })
      .from(documents)
      .where(eq(documents.id, documentId));
    return d;
  });
  if (!doc) return false;
  // If removal fails this throws and the row stays, so the delete can be retried.
  await deps.storage.removeObject(doc.storagePath);
  await deps.withUser(userId, (tx) =>
    tx.delete(documents).where(eq(documents.id, documentId)),
  );
  return true;
}
