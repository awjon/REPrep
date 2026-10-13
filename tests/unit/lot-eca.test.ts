import { describe, expect, it, vi } from 'vitest';
import { lookupEca, parseEcaLayers } from '@/lib/lot/eca';

const layers = [
  { name: 'Steep slope', url: 'https://example.test/arcgis/rest/services/eca/MapServer/1' },
  { name: 'Liquefaction', url: 'https://example.test/arcgis/rest/services/eca/MapServer/2/' },
];
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('parseEcaLayers', () => {
  it('returns null when unset or empty', () => {
    expect(parseEcaLayers(undefined)).toBeNull();
    expect(parseEcaLayers('')).toBeNull();
    expect(parseEcaLayers('[]')).toBeNull();
  });
  it('parses JSON and rejects bad shapes and non-https urls', () => {
    expect(parseEcaLayers(JSON.stringify(layers))).toHaveLength(2);
    expect(() => parseEcaLayers('nope')).toThrow();
    expect(() => parseEcaLayers([{ name: 'x', url: 'http://example.test/1' }])).toThrow();
    expect(() => parseEcaLayers([{ name: '', url: 'https://example.test/1' }])).toThrow();
  });
});

describe('lookupEca', () => {
  it('not_configured without layers and makes no requests', async () => {
    const f = vi.fn();
    expect(await lookupEca(47.5, -122.3, { fetch: f as never, layers: undefined })).toEqual({ status: 'not_configured' });
    expect(f).not.toHaveBeenCalled();
  });

  it('reads SEATTLE_ECA_LAYERS from the environment by default', async () => {
    const saved = process.env.SEATTLE_ECA_LAYERS;
    delete process.env.SEATTLE_ECA_LAYERS;
    try {
      expect(await lookupEca(47.5, -122.3)).toEqual({ status: 'not_configured' });
    } finally {
      if (saved !== undefined) process.env.SEATTLE_ECA_LAYERS = saved;
    }
  });

  it('ok: queries each layer by point with count-only and maps counts to presence', async () => {
    const urls: string[] = [];
    const f = vi.fn((u: string) => {
      urls.push(u);
      return json({ count: u.includes('/1/query') ? 2 : 0 });
    });
    const r = await lookupEca(47.5, -122.3, { fetch: f as never, layers });
    expect(r).toEqual({
      status: 'ok',
      layers: [
        { name: 'Steep slope', present: true },
        { name: 'Liquefaction', present: false },
      ],
    });
    const u = new URL(urls[0]!);
    expect(u.pathname).toBe('/arcgis/rest/services/eca/MapServer/1/query');
    expect(Object.fromEntries(u.searchParams)).toEqual({
      geometry: '-122.3,47.5',
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      returnCountOnly: 'true',
      f: 'json',
    });
    expect(new URL(urls[1]!).pathname).toBe('/arcgis/rest/services/eca/MapServer/2/query');
  });

  it('error on HTTP failure, ArcGIS error body, network failure, or bad config', async () => {
    expect((await lookupEca(1, 2, { fetch: (() => json({}, 500)) as never, layers })).status).toBe('error');
    expect((await lookupEca(1, 2, { fetch: (() => json({ error: { code: 400 } })) as never, layers })).status).toBe('error');
    expect((await lookupEca(1, 2, { fetch: (() => Promise.reject(new Error('down'))) as never, layers })).status).toBe('error');
    expect((await lookupEca(1, 2, { layers: 'not json' })).status).toBe('error');
    expect((await lookupEca(Number.NaN, 2, { layers })).status).toBe('error');
  });

  it('error when a request exceeds the timeout', async () => {
    const f = (_u: string, init: RequestInit) =>
      new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new Error('aborted'))));
    const r = await lookupEca(1, 2, { fetch: f as never, layers, timeoutMs: 20 });
    expect(r).toEqual({ status: 'error' });
  });
});
