import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { reviewEnv } from '@/lib/env';

// Service-role access to the private `documents` bucket. Callers must have checked ownership
// (RLS on the `documents` table, or the path-prefix check) before using these. Never import
// this from a client component: the service key must not reach a client bundle.

const BUCKET = 'documents';

let cached: SupabaseClient | undefined;

function bucket() {
  if (!cached) {
    const env = reviewEnv();
    cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached.storage.from(BUCKET);
}

/** A short-lived signed upload URL. `upsert` stays false: a path can be written once. */
export async function createUploadUrl(path: string): Promise<{ signedUrl: string; token: string; path: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw new Error('could not create upload url');
  return data;
}

export async function downloadPdf(path: string): Promise<Uint8Array> {
  const { data, error } = await bucket().download(path);
  if (error || !data) throw new Error('could not download object');
  return new Uint8Array(await data.arrayBuffer());
}

/** Idempotent: removing a missing object is not an error. */
export async function removeObject(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) throw new Error('could not remove object');
}

/** Remove several objects in one call (used when a whole deal is deleted). */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw new Error('could not remove objects');
}

/** Size in bytes, or null when the object does not exist. */
export async function objectSize(path: string): Promise<number | null> {
  const { data, error } = await bucket().info(path);
  if (error || !data) return null;
  return typeof data.size === 'number' ? data.size : null;
}
