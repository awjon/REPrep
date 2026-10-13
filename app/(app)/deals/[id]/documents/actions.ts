'use server';

import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { schema, withUser } from '@/lib/db/client';
import { deleteDocument, finalizeDocument } from '@/lib/documents/service';
import { buildStoragePath, checkUpload, UPLOAD_DOC_TYPES } from '@/lib/documents/validation';
import { createUploadUrl, downloadPdf, objectSize, removeObject } from '@/lib/storage/documents';
import { isUuid } from '../../data';

const docType = z.enum(UPLOAD_DOC_TYPES);

export type PrepareResult = { ok: true; path: string; token: string; signedUrl: string } | { ok: false; error: string };
export type FinalizeActionResult = { ok: true; documentId: string } | { ok: false; error: string };

export async function prepareUpload(
  dealId: string,
  input: { filename: string; sizeBytes: number; docType: string },
): Promise<PrepareResult> {
  const user = await requireUser();
  if (!isUuid(dealId)) return { ok: false, error: 'That property could not be found.' };
  const type = docType.safeParse(input.docType);
  if (!type.success) return { ok: false, error: 'Choose a document type.' };
  const check = checkUpload({ filename: String(input.filename), sizeBytes: Number(input.sizeBytes) });
  if (!check.ok) return check;

  const [deal] = await withUser(user.id, (tx) =>
    tx.select({ id: schema.deals.id }).from(schema.deals).where(eq(schema.deals.id, dealId)),
  );
  if (!deal) return { ok: false, error: 'That property could not be found.' };

  try {
    const path = buildStoragePath(user.id, dealId, randomUUID());
    const { token, signedUrl } = await createUploadUrl(path);
    return { ok: true, path, token, signedUrl };
  } catch {
    return { ok: false, error: 'Could not start the upload. Try again.' };
  }
}

export async function finalizeUpload(
  dealId: string,
  input: { path: string; filename: string; docType: string },
): Promise<FinalizeActionResult> {
  const user = await requireUser();
  const type = docType.safeParse(input.docType);
  if (!isUuid(dealId) || !type.success) return { ok: false, error: 'That upload could not be saved.' };
  try {
    const res = await finalizeDocument(
      { withUser, storage: { objectSize, downloadPdf, removeObject } },
      user.id,
      dealId,
      { path: String(input.path), filename: String(input.filename), docType: type.data },
    );
    if (res.ok) revalidatePath(`/deals/${dealId}/documents`);
    return res;
  } catch {
    return { ok: false, error: 'That upload could not be saved. Try again.' };
  }
}

export async function deleteDocumentAction(dealId: string, documentId: string): Promise<void> {
  const user = await requireUser();
  if (!isUuid(dealId) || !isUuid(documentId)) return;
  await deleteDocument({ withUser, storage: { objectSize, downloadPdf, removeObject } }, user.id, documentId);
  revalidatePath(`/deals/${dealId}/documents`);
}
