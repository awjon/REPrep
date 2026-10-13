import 'server-only';
import { emailEnv } from '@/lib/env';

export type SendArgs = { to: string; subject: string; text: string; html: string; idempotencyKey?: string };
export type SendResult = { ok: true; id: string } | { ok: false; reason: string };
export type SendFn = (args: SendArgs) => Promise<SendResult>;

/** Minimal Resend client over fetch. Reasons are short machine strings, never provider bodies. */
export const sendEmail: SendFn = async ({ to, subject, text, html, idempotencyKey }) => {
  const { RESEND_API_KEY, EMAIL_FROM } = emailEnv();
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        // Resend de-duplicates retries with the same key, so a send whose outcome was unknown
        // (timeout after acceptance) is not delivered twice when the next run retries it.
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text, html }),
    });
    if (res.status === 429) return { ok: false, reason: 'resend_429' };
    if (!res.ok) return { ok: false, reason: 'resend_error' };
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
    if (!body || typeof body.id !== 'string') return { ok: false, reason: 'resend_error' };
    return { ok: true, id: body.id };
  } catch {
    return { ok: false, reason: 'resend_error' };
  }
};
