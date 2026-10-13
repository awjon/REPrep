// Orchestration. fetch and the database are injected so tests can drive it end to end.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type postgres from 'postgres';
import { z } from 'zod';
import { IngestError } from './errors.js';
import { downloadTo, openCsv, probe, type Meta } from './files.js';
import {
  createStaging, dropStaging, isLoadable, lastRun, recordRun, stageSource, swapSource, validateStaged,
  type LoadConfig,
} from './load.js';
import { RUN_ORDER, SOURCE_NAMES, SPECS, isSourceName, type SourceName } from './sources.js';

export const ADVISORY_LOCK_KEY = 7_245_001;

export const RunRequestSchema = z.object({
  force: z.boolean().default(false),
  sources: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'http(s) only'),
      }),
    )
    .min(1),
});
export type RunRequest = z.infer<typeof RunRequestSchema>;

export interface RunDeps {
  sql: postgres.Sql;
  fetch: typeof fetch;
  config: LoadConfig;
  tmpRoot?: string;
  log?: (msg: string, fields?: Record<string, unknown>) => void;
  now?: () => number;
}

export type RunOutcome =
  | { status: 200; body: { ok: true; changed: string[]; unchanged: string[]; rows: Record<string, number>; durationMs: number } }
  | { status: number; body: { ok: false; error: string; source?: string } };

let running = false; // in-process lock; the advisory lock covers other processes

function same(a: Meta, b: Meta | null): boolean {
  if (!b) return false;
  if (a.etag == null && a.lastModified == null) return false; // server gave us nothing to compare
  return a.etag === b.etag && a.lastModified === b.lastModified;
}

export async function runIngest(deps: RunDeps, req: RunRequest): Promise<RunOutcome> {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? (() => {});
  const started = now();

  // Validate names up front so a typo cannot half-run a job.
  const seen = new Set<string>();
  for (const s of req.sources) {
    if (!isSourceName(s.name)) return { status: 400, body: { ok: false, error: 'unknown_source', source: s.name } };
    if (seen.has(s.name)) return { status: 400, body: { ok: false, error: 'duplicate_source', source: s.name } };
    seen.add(s.name);
  }

  if (running) return { status: 409, body: { ok: false, error: 'busy' } };
  running = true;
  let conn: postgres.ReservedSql | undefined;
  let locked = false;
  let tmp: string | undefined;
  try {
    conn = await deps.sql.reserve();
    const [lock] = await conn<{ ok: boolean }[]>`select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as ok`;
    if (!lock!.ok) return { status: 409, body: { ok: false, error: 'busy' } };
    locked = true;
    await conn.unsafe('set statement_timeout = 0'); // long swaps; pooler/role defaults may be short

    tmp = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), 'reprep-ingest-'));
    const byName = new Map(req.sources.map((s) => [s.name as SourceName, s.url]));
    const changed: string[] = [];
    const unchanged: string[] = [];
    const rows: Record<string, number> = {};

    for (const name of RUN_ORDER) {
      const url = byName.get(name);
      if (!url) continue;
      const t0 = now();
      try {
        const head = await probe(deps.fetch, url);
        if (!req.force && same(head, await lastRun(conn, name))) {
          unchanged.push(name);
          log('source unchanged', { source: name });
          continue;
        }
        if (!isLoadable(name)) {
          // `lookup`: accepted and recorded, nothing loaded yet.
          await recordRun(conn, name, head, 0);
          changed.push(name);
          rows[name] = 0;
          log('source recorded', { source: name, rows: 0, ms: now() - t0 });
          continue;
        }

        const file = join(tmp, `${name}.dl`);
        const dl = await downloadTo(deps.fetch, url, file);
        const meta: Meta = { etag: dl.etag ?? head.etag, lastModified: dl.lastModified ?? head.lastModified };
        await createStaging(conn, name);
        try {
          const input = await openCsv(file, SPECS[name].file);
          const st = await stageSource(conn, name, input, deps.config);
          await validateStaged(conn, name, st.staged);
          const n = await swapSource(conn, name, meta);
          changed.push(name);
          rows[name] = n;
          log('source loaded', {
            source: name, bytes: dl.bytes, read: st.read, staged: st.staged, parseErrors: st.parseErrors,
            rows: n, ms: now() - t0,
          });
        } finally {
          await dropStaging(conn, name);
          await rm(file, { force: true });
        }
      } catch (e) {
        const err = e instanceof IngestError ? e : new IngestError('load_failed', 500, (e as Error).message);
        log('source failed', { source: name, error: err.code, detail: err.message.slice(0, 300), ms: now() - t0 });
        return { status: err.status, body: { ok: false, error: err.code, source: name } };
      }
    }
    const durationMs = now() - started;
    log('run complete', { changed, unchanged, rows, durationMs });
    return { status: 200, body: { ok: true, changed, unchanged, rows, durationMs } };
  } catch (e) {
    log('run failed', { error: (e as Error).message.slice(0, 300) });
    return { status: 500, body: { ok: false, error: 'internal_error' } };
  } finally {
    if (conn) {
      if (locked) await conn`select pg_advisory_unlock(${ADVISORY_LOCK_KEY})`.catch(() => {});
      conn.release();
    }
    if (tmp) await rm(tmp, { recursive: true, force: true });
    running = false;
  }
}

export { SOURCE_NAMES };
