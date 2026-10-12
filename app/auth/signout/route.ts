import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  const dest = request.nextUrl.clone();
  dest.pathname = '/login';
  dest.search = '';
  return NextResponse.redirect(dest, { status: 303 });
}
