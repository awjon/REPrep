import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { withUser as withUserOn, type Db, type Tx } from './rls';
import * as schema from './schema';

let cached: Db | undefined;

/**
 * Connection as the database owner. Bypasses RLS — use only for n8n jobs and
 * other server-side work that is not acting for a signed-in user.
 * Created lazily so `next build` does not need DATABASE_URL.
 */
export function adminDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    // prepare:false — Supabase's transaction pooler does not support prepared statements.
    const client = postgres(url, { prepare: false, max: 5 });
    cached = drizzle(client, { schema });
  }
  return cached;
}

/** Run queries as a signed-in user, with RLS enforced. */
export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withUserOn(adminDb(), userId, fn);
}

export { schema };
export type { Tx };
