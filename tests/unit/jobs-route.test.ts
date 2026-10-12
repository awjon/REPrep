import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/jobs/reminders/route';

const TOKEN = 't'.repeat(40);
const saved = { ...process.env };
const call = (body: unknown, auth: string | null = `Bearer ${TOKEN}`) =>
  POST(
    new Request('http://x.test/api/jobs/reminders', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
const good = () => ({ runAt: new Date().toISOString(), lookaheadHours: 48, dryRun: true });

beforeEach(() => {
  process.env.JOBS_TOKEN = TOKEN;
});
afterEach(() => {
  process.env = { ...saved };
});

describe('POST /api/jobs/reminders (non-DB paths)', () => {
  it('500 not_configured without JOBS_TOKEN', async () => {
    delete process.env.JOBS_TOKEN;
    const r = await call(good());
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: 'not_configured' });
  });
  it('401 with empty body for missing or wrong token', async () => {
    for (const a of [null, 'Bearer nope']) {
      const r = await call(good(), a);
      expect(r.status).toBe(401);
      expect(await r.text()).toBe('');
    }
  });
  it('400 bad_request for malformed or out-of-range bodies', async () => {
    for (const b of ['not json', {}, { ...good(), lookaheadHours: 0 }, { ...good(), lookaheadHours: 169 }, { ...good(), lookaheadHours: 1.5 }, { ...good(), dryRun: 'no' }, { ...good(), runAt: 'yesterday' }]) {
      const r = await call(b);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ ok: false, error: 'bad_request' });
    }
  });
  it('400 bad_run_at when runAt is more than 15 minutes from server time', async () => {
    for (const ms of [-16 * 60_000, 16 * 60_000]) {
      const r = await call({ ...good(), runAt: new Date(Date.now() + ms).toISOString() });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ ok: false, error: 'bad_run_at' });
    }
  });
});
