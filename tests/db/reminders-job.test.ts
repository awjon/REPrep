import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withUser, type Db } from '@/lib/db/rls';
import * as schema from '@/lib/db/schema';
import type { SendArgs, SendFn } from '@/lib/email/resend';
import { runReminders } from '@/lib/jobs/reminders';

const url = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/reprep_test';
const client = postgres(url, { prepare: false, max: 6, onnotice: () => {} });
const db: Db = drizzle(client, { schema });

// Far-future clock so rows from other test files never fall inside the window.
const NOW = new Date('2030-03-12T18:00:00Z');
const H = 3_600_000;
const at = (h: number) => new Date(NOW.getTime() + h * H);
const A = randomUUID();
const B = randomUUID();
const ids: Record<string, string> = {};

async function mkDeal(user: string, address: string, status: 'under_contract' | 'closed' = 'under_contract') {
  const [d] = await withUser(db, user, (tx) => tx.insert(schema.deals).values({ address, status }).returning());
  return d!.id;
}
async function mkDate(user: string, dealId: string, key: string, due: Date, completedAt: Date | null = null) {
  const [r] = await withUser(db, user, (tx) =>
    tx.insert(schema.dealDates).values({ dealId, kind: 'custom', label: key, dueAt: due, completedAt }).returning(),
  );
  ids[key] = r!.id;
}

function fakeSend(opts: { fail?: () => boolean } = {}) {
  const calls: SendArgs[] = [];
  const send: SendFn = async (a) => {
    calls.push(a);
    if (opts.fail?.()) return { ok: false, reason: 'resend_429' };
    return { ok: true, id: `msg-${calls.length}` };
  };
  return { calls, send };
}
const run = (send: SendFn, extra: Partial<{ dryRun: boolean; lookaheadHours: number }> = {}) =>
  runReminders(db, { now: NOW, lookaheadHours: 48, dryRun: false, appUrl: 'https://app.test', send, ...extra });
const sends = () =>
  db.select().from(schema.reminderSends).where(inArray(schema.reminderSends.userId, [A, B]));

beforeAll(async () => {
  await client`insert into auth.users (id, email) values (${A}, 'a@test.local'), (${B}, 'b@test.local')`;
  const a1 = await mkDeal(A, '1 Alpha St');
  const a2 = await mkDeal(A, '2 Alpha St');
  const closed = await mkDeal(A, '3 Closed St', 'closed');
  const b1 = await mkDeal(B, '1 Beta St');
  await mkDate(A, a1, 'a1-inspection', at(20));
  await mkDate(A, a2, 'a2-financing', at(30));
  await mkDate(B, b1, 'b1-closing', at(5));
  await mkDate(A, closed, 'closed-deal', at(10));
  await mkDate(A, a1, 'completed', at(10), new Date());
  await mkDate(A, a1, 'far-out', at(100));
  await mkDate(A, a1, 'past', at(-2));
});
afterAll(async () => {
  await client`delete from auth.users where id in (${A}, ${B})`;
  await client.end();
});
beforeEach(async () => {
  await db.delete(schema.reminderSends).where(inArray(schema.reminderSends.userId, [A, B]));
});

describe('runReminders', () => {
  it('sends one grouped email per user and records the claims', async () => {
    const { calls, send } = fakeSend();
    const r = await run(send);
    expect(r).toEqual({ ok: true, due: 3, sent: 3, skipped: 0, failed: 0, errors: [] });
    expect(calls).toHaveLength(2);
    const toA = calls.find((c) => c.to === 'a@test.local')!;
    expect(toA.subject).toBe('REPrep: 2 deadlines coming up');
    expect(toA.text).toContain('1 Alpha St');
    expect(toA.text).toContain('/deals/');
    expect(toA.text).not.toContain('Closed St');
    expect(calls.find((c) => c.to === 'b@test.local')!.subject).toBe('REPrep: 1 deadline coming up');
    const rows = await sends();
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.providerMessageId?.startsWith('msg-'))).toBe(true);
  });

  it('a second run sends nothing and counts the items as skipped', async () => {
    await run(fakeSend().send);
    const { calls, send } = fakeSend();
    expect(await run(send)).toEqual({ ok: true, due: 3, sent: 0, skipped: 3, failed: 0, errors: [] });
    expect(calls).toHaveLength(0);
  });

  it('dryRun reports counts and writes and sends nothing', async () => {
    const { calls, send } = fakeSend();
    expect(await run(send, { dryRun: true })).toEqual({ ok: true, due: 3, sent: 0, skipped: 0, failed: 0, errors: [] });
    expect(calls).toHaveLength(0);
    expect(await sends()).toHaveLength(0);
  });

  it('a failed send releases its claims and the next run retries', async () => {
    let failB = true;
    const first = fakeSend({ fail: () => failB });
    // Fail only the second email so one user succeeds and one fails, whichever order they go in.
    let n = 0;
    const send: SendFn = (a) => {
      n += 1;
      failB = n === 2;
      return first.send(a);
    };
    const r = await run(send);
    expect(r.sent + r.failed).toBe(3);
    expect(r.failed).toBeGreaterThan(0);
    expect(r.errors.every((e) => e.reason === 'resend_429' && e.dealDateId in Object.fromEntries(Object.values(ids).map((v) => [v, 1])))).toBe(true);
    expect(await sends()).toHaveLength(r.sent);

    const retry = fakeSend();
    const r2 = await run(retry.send);
    expect(r2.sent).toBe(r.failed);
    expect(r2.skipped).toBe(r.sent);
    expect(await sends()).toHaveLength(3);
  });

  it('ignores closed deals, completed, past, and out-of-lookahead dates', async () => {
    const { calls, send } = fakeSend();
    await run(send);
    const sentIds = (await sends()).map((x) => x.dealDateId).sort();
    expect(sentIds).toEqual([ids['a1-inspection']!, ids['a2-financing']!, ids['b1-closing']!].sort());
    // widening the lookahead loads the far-out date, but no reminder stage has begun for it yet
    const wide = await run(fakeSend().send, { lookaheadHours: 120 });
    expect(wide).toMatchObject({ due: 3, sent: 0, skipped: 3 });
    expect(calls).toHaveLength(2);
  });

  it('two concurrent runs send each item exactly once', async () => {
    const { calls, send } = fakeSend();
    const [r1, r2] = await Promise.all([run(send), run(send)]);
    expect(r1.sent + r2.sent).toBe(3);
    expect(r1.failed + r2.failed).toBe(0);
    expect(r1.skipped + r2.skipped).toBe(3);
    const sentTo = calls.flatMap((c) => c.text.match(/Alpha|Beta/g) ?? []);
    expect(sentTo.filter((x) => x === 'Alpha')).toHaveLength(2);
    expect(sentTo.filter((x) => x === 'Beta')).toHaveLength(1);
    expect(await sends()).toHaveLength(3);
  });

  it('a send that throws is treated as a failure', async () => {
    const r = await run(async () => {
      throw new Error('boom');
    });
    expect(r.failed).toBe(3);
    expect(r.errors[0]!.reason).toBe('send_exception');
    expect(await sends()).toHaveLength(0);
  });
});
