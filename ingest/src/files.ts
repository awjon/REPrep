// Download-to-disk and zip/CSV streaming. Memory stays flat regardless of file size:
// the HTTP body is piped to a temp file, yauzl then streams one entry out of it.
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { IngestError } from './errors.js';

export interface Meta {
  etag: string | null;
  lastModified: string | null;
}

export function metaOf(res: Response): Meta {
  return { etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
}

/** HEAD first; fall back to GET headers (body discarded) if HEAD fails or is rejected. */
export async function probe(fetchFn: typeof fetch, url: string): Promise<Meta> {
  try {
    const head = await fetchFn(url, { method: 'HEAD' });
    await head.body?.cancel();
    if (head.ok) return metaOf(head);
  } catch {
    /* fall through to GET */
  }
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch (e) {
    throw new IngestError('download_failed', 502, (e as Error).message);
  }
  await res.body?.cancel();
  if (!res.ok) throw new IngestError('download_failed', 502, `HTTP ${res.status}`);
  return metaOf(res);
}

export async function downloadTo(fetchFn: typeof fetch, url: string, dest: string): Promise<Meta & { bytes: number }> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch (e) {
    throw new IngestError('download_failed', 502, (e as Error).message);
  }
  if (!res.ok || !res.body) {
    await res.body?.cancel();
    throw new IngestError('download_failed', 502, `HTTP ${res.status}`);
  }
  try {
    await pipeline(Readable.fromWeb(res.body as import('node:stream/web').ReadableStream), createWriteStream(dest));
  } catch (e) {
    throw new IngestError('download_failed', 502, (e as Error).message);
  }
  const bytes = (await stat(dest)).size;
  const declared = res.headers.get('content-length');
  // A content-encoding means the body was decoded, so the declared length no longer applies.
  if (declared && !res.headers.get('content-encoding') && Number(declared) !== bytes) {
    throw new IngestError('download_incomplete', 502, `got ${bytes} of ${declared} bytes`);
  }
  if (bytes === 0) throw new IngestError('download_failed', 502, 'empty body');
  return { ...metaOf(res), bytes };
}

async function isZip(path: string): Promise<boolean> {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(4);
    await fh.read(buf, 0, 4, 0);
    return buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5);
  } finally {
    await fh.close();
  }
}

/**
 * Stream of CSV bytes from `path`. If it is a zip, streams the entry named `file`
 * (case-insensitive, any folder), or the first .csv when `file` is null.
 * Otherwise the file is treated as a plain CSV.
 */
export async function openCsv(path: string, file: string | null): Promise<Readable> {
  if (!(await isZip(path))) return createReadStream(path);

  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) =>
    yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, z) =>
      err || !z ? reject(new IngestError('invalid_file', 422, err?.message ?? 'bad zip')) : resolve(z),
    ),
  );
  const entry = await new Promise<yauzl.Entry>((resolve, reject) => {
    zip.on('entry', (e: yauzl.Entry) => {
      const base = e.fileName.split('/').pop()!.toLowerCase();
      const hit = file ? base === file.toLowerCase() : base.endsWith('.csv');
      if (hit && !e.fileName.endsWith('/')) resolve(e);
      else zip.readEntry();
    });
    zip.on('end', () => reject(new IngestError('invalid_file', 422, `${file ?? '*.csv'} not found in zip`)));
    zip.on('error', (e) => reject(new IngestError('invalid_file', 422, e.message)));
    zip.readEntry();
  }).catch((e) => {
    zip.close();
    throw e;
  });
  return new Promise<Readable>((resolve, reject) =>
    zip.openReadStream(entry, (err, s) => {
      if (err || !s) {
        zip.close();
        return reject(new IngestError('invalid_file', 422, err?.message ?? 'cannot read entry'));
      }
      s.on('close', () => zip.close());
      resolve(s);
    }),
  );
}
