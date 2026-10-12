import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Runs `fn` inside a transaction as the Postgres `authenticated` role with the
 * given user's JWT claims, so every query is filtered by RLS exactly as it
 * would be through Supabase's API. All user-facing data access goes through this.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('withUser: invalid user id');
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx);
  });
}
