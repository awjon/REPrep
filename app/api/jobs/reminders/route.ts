import 'server-only';
import { z } from 'zod';
import { adminDb } from '@/lib/db/client';
import { sendEmail } from '@/lib/email/resend';
import { emailEnv, jobsEnv } from '@/lib/env';
import { checkBearer } from '@/lib/jobs/auth';
import { runReminders } from '@/lib/jobs/reminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SKEW_MS = 15 * 60_000;

const bodySchema = z.object({
  runAt: z.string().datetime({ offset: true }),
  lookaheadHours: z.number().int().min(1).max(168),
  dryRun: z.boolean(),
});

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(req: Request): Promise<Response> {
  let token: string;
  try {
    token = jobsEnv().JOBS_TOKEN;
  } catch {
    return json({ ok: false, error: 'not_configured' }, 500);
  }
  if (!checkBearer(req.headers.get('authorization'), token)) return new Response(null, { status: 401 });

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400);
  }
  const now = new Date(parsed.runAt);
  if (Math.abs(now.getTime() - Date.now()) > MAX_SKEW_MS) return json({ ok: false, error: 'bad_run_at' }, 400);

  let appUrl = '';
  if (!parsed.dryRun) {
    try {
      appUrl = emailEnv().APP_URL;
    } catch {
      return json({ ok: false, error: 'not_configured' }, 500);
    }
  }

  try {
    const result = await runReminders(adminDb(), {
      now,
      lookaheadHours: parsed.lookaheadHours,
      dryRun: parsed.dryRun,
      send: sendEmail,
      appUrl,
    });
    console.log(
      `reminders: due=${result.due} sent=${result.sent} skipped=${result.skipped} failed=${result.failed} dryRun=${parsed.dryRun}`,
    );
    return json(result, 200);
  } catch {
    console.error('reminders: internal error');
    return json({ ok: false, error: 'internal' }, 500);
  }
}
