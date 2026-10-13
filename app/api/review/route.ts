import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { currentUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { encodeLine } from '@/lib/documents/ndjson';
import { beginReview, executeReview, type ReviewDeps } from '@/lib/documents/run-review';
import { reviewEnv } from '@/lib/env';
import { reviewDocument, type MessagesClient } from '@/lib/review/pipeline';
import { downloadPdf } from '@/lib/storage/documents';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const body = z.object({ documentId: z.string().uuid() });

const json = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(req: Request): Promise<Response> {
  const user = await currentUser();
  if (!user) return json(401, 'unauthorized');

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(400, 'bad_request');
  const { documentId } = parsed.data;

  let deps: ReviewDeps;
  try {
    const env = reviewEnv();
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) as unknown as MessagesClient;
    deps = {
      withUser,
      downloadPdf,
      model: env.MODEL_REVIEW,
      review: (o) => reviewDocument({ ...o, client, models: { review: env.MODEL_REVIEW, triage: env.MODEL_TRIAGE } }),
    };
  } catch {
    return json(500, 'internal');
  }

  let begun;
  try {
    begun = await beginReview(deps, user.id, documentId);
  } catch {
    return json(500, 'internal');
  }
  if (begun.kind === 'not_found') return json(404, 'not_found');
  if (begun.kind === 'running') return json(409, 'already_running');

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      await executeReview(deps, user.id, documentId, begun, (line) => controller.enqueue(enc.encode(encodeLine(line))));
      try {
        controller.close();
      } catch {
        /* already closed by the client */
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}
