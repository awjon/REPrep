// Pure sign-in policy, kept separate so it can be unit tested without Next or Supabase.

export type SignInDecision = { allowed: true; createUser: boolean } | { allowed: false; reason: 'not_invited' };

export function signInDecision(email: string, publicSignup: boolean, allowlist: string[]): SignInDecision {
  if (publicSignup) return { allowed: true, createUser: true };
  const normalized = email.trim().toLowerCase();
  return allowlist.includes(normalized) ? { allowed: true, createUser: true } : { allowed: false, reason: 'not_invited' };
}

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/deals';
  return next;
}
