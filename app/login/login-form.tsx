'use client';

import { useActionState } from 'react';
import { requestMagicLink, type LoginState } from './actions';

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestMagicLink, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <p role="status" className="rounded-md border border-line bg-panel p-4 text-sm">
        If that address can sign in, a link is on its way. It expires in an hour.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="next" value={next ?? ''} />
      <label className="block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 dark:bg-panel"
      />
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  );
}
