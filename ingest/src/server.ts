import { createHash, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import postgres from 'postgres';
import { RunRequestSchema, runIngest, type RunDeps } from './run.js';
import { addressColumns } from './sources.js';

const sha = (s: string) => createHash('sha256').update(s).digest();

/** Constant-time bearer check: hash both sides so lengths are equal, then timingSafeEqual. */
export function authorized(header: string | undefined, token: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? '');
  const got = sha(m ? m[1]! : '');
  const ok = timingSafeEqual(got, sha(token));
  return ok && m !== null;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) });
  res.end(data);
}

async function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req as AsyncIterable<Buffer>) {
    size += c.length;
    if (size > limit) throw new Error('too_large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createApp(deps: RunDeps, token: string): Server {
  return createServer(async (req, res) => {
    try {
      const path = (req.url ?? '').split('?')[0];
      if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
      if (req.method === 'POST' && path === '/run') {
        if (!authorized(req.headers.authorization, token)) {
          res.writeHead(401).end();
          return;
        }
        let json: unknown;
        try {
          json = JSON.parse((await readBody(req)) || '{}');
        } catch {
          return send(res, 400, { ok: false, error: 'invalid_request' });
        }
        const parsed = RunRequestSchema.safeParse(json);
        if (!parsed.success) return send(res, 400, { ok: false, error: 'invalid_request' });
        const out = await runIngest(deps, parsed.data);
        return send(res, out.status, out.body);
      }
      send(res, 404, { ok: false, error: 'not_found' });
    } catch {
      if (!res.headersSent) send(res, 500, { ok: false, error: 'internal_error' });
    }
  });
}

function log(msg: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...fields }));
}

function main(): void {
  const databaseUrl = process.env.DATABASE_URL;
  const token = process.env.INGEST_TOKEN;
  if (!databaseUrl || !token) {
    console.error('DATABASE_URL and INGEST_TOKEN are required');
    process.exit(1);
  }
  const salesSince = process.env.SALES_SINCE ?? '2015-01-01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(salesSince)) {
    console.error('SALES_SINCE must be YYYY-MM-DD');
    process.exit(1);
  }
  const sql = postgres(databaseUrl, { max: 3, onnotice: () => {} });
  const server = createApp(
    {
      sql,
      fetch,
      log,
      config: {
        salesSince,
        encoding: (process.env.CSV_ENCODING ?? 'latin1') as BufferEncoding,
        addressColumns: addressColumns(),
      },
    },
    token,
  );
  const port = Number(process.env.PORT ?? 8080);
  server.listen(port, () => log('listening', { port }));
  const stop = () => {
    server.close(() => void sql.end({ timeout: 5 }).then(() => process.exit(0)));
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
