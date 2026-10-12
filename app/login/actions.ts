'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { safeNext, signInDecision } from '@/lib/auth-policy';
import { authEnv } from '@/lib/env';
import { supabaseServer } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string };

const input = z.object({ email: z.string().trim().email(), next: z.string().optional() });

export async function requestMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = input.safeParse({ email: form.get('email'), next: form.get('next') ?? undefined });
  if (!parsed.success) return { status: 'error', message: 'Enter a valid email address.' };

  const env = authEnv();
  const decision = signInDecision(parsed.data.email, env.FEATURE_PUBLIC_SIGNUP, env.ALLOWED_EMAILS);
  // Same response either way, so the form doesn't reveal who is invited.
  if (!decision.allowed) return { status: 'sent' };

  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: decision.createUser,
      emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(safeNext(parsed.data.next))}`,
    },
  });
  if (error) return { status: 'error', message: 'Could not send the link. Try again in a minute.' };
  return { status: 'sent' };
}
