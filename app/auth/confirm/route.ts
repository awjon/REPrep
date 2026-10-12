import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNext } from '@/lib/auth-policy';
import { supabaseServer } from '@/lib/supabase/server';

// Magic-link landing. Supports both Supabase link styles:
//  - token_hash + type (recommended email template for SSR)
//  - code (PKCE redirect)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get('next'));
  const supabase = await supabaseServer();

  const tokenHash = params.get('token_hash');
  const type = params.get('type') as EmailOtpType | null;
  const code = params.get('code');

  let ok = false;
  if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  } else if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  }

  const dest = request.nextUrl.clone();
  dest.search = '';
  if (ok) {
    dest.pathname = next;
  } else {
    dest.pathname = '/login';
    dest.searchParams.set('error', 'link');
  }
  return NextResponse.redirect(dest);
}
