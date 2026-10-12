import Link from 'next/link';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <header className="flex items-center justify-between border-b border-line py-4">
        <Link href="/deals" className="font-display text-xl">
          REPrep
        </Link>
        <form action="/auth/signout" method="post" className="flex items-center gap-3 text-sm text-muted">
          <span className="hidden sm:inline">{user.email}</span>
          <button type="submit" className="underline-offset-4 hover:underline">
            Sign out
          </button>
        </form>
      </header>
      <div className="pt-6">{children}</div>
    </div>
  );
}
