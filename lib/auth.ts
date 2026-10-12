import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { supabaseServer } from '@/lib/supabase/server';

export type SessionUser = { id: string; email: string };

/** The signed-in user, verified with Supabase Auth (not just decoded from the cookie). */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? '' };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect('/login');
  return user;
}
