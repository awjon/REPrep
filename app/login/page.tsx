import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { isAuthConfigured } from '@/lib/env';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  if (!isAuthConfigured()) {
    return (
      <main className="mx-auto max-w-sm px-4 py-16">
        <h1 className="font-display text-2xl">REPrep</h1>
        <p className="mt-4 text-sm text-muted">Sign-in isn&apos;t configured on this deployment yet.</p>
      </main>
    );
  }
  if (await currentUser()) redirect('/deals');

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-3xl">REPrep</h1>
      <p className="mt-2 text-sm text-muted">Prep for buying a home without an agent.</p>
      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          That link has expired or was already used. Request a new one.
        </p>
      )}
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
    </main>
  );
}
