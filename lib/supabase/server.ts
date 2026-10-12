import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { authEnv } from '@/lib/env';

/** Supabase client bound to the request's auth cookies. Auth only — data goes through Drizzle + withUser. */
export async function supabaseServer() {
  const env = authEnv();
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there; middleware refreshes them.
        }
      },
    },
  });
}
