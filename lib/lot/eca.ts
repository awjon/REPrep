// Environmentally critical area (ECA) overlay lookup by point, against ArcGIS REST layers listed in
// SEATTLE_ECA_LAYERS (JSON array of {name, url}). No layer URL is hardcoded: they are configured
// from the City of Seattle's official GIS services.

import { z } from 'zod';
import type { EcaResult } from './flags';

export type EcaLayer = { name: string; url: string };
export type EcaOptions = {
  fetch?: typeof fetch;
  layers?: unknown;
  timeoutMs?: number;
};

const layersSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(120),
      url: z.string().trim().url().refine((u) => u.startsWith('https://'), 'https only'),
    }),
  )
  .max(20);

/** Parses the env value. `null` means not configured; throws when set but malformed. */
export function parseEcaLayers(raw: unknown): EcaLayer[] | null {
  if (raw == null) return null;
  let value = raw;
  if (typeof raw === 'string') {
    if (raw.trim() === '') return null;
    value = JSON.parse(raw);
  }
  const layers = layersSchema.parse(value);
  return layers.length === 0 ? null : layers;
}

const queryUrl = (base: string, lat: number, lon: number): string => {
  const u = new URL(base.replace(/\/+$/, '').replace(/\/query$/, '') + '/query');
  u.searchParams.set('geometry', `${lon},${lat}`);
  u.searchParams.set('geometryType', 'esriGeometryPoint');
  u.searchParams.set('inSR', '4326');
  u.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
  u.searchParams.set('returnCountOnly', 'true');
  u.searchParams.set('f', 'json');
  return u.toString();
};

const countSchema = z.object({ count: z.number().int().min(0) });

async function layerPresent(layer: EcaLayer, lat: number, lon: number, f: typeof fetch, timeoutMs: number) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(queryUrl(layer.url, lat, lon), { signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const body = (await res.json()) as unknown; // ArcGIS reports errors as 200 with an `error` object
    return { name: layer.name, present: countSchema.parse(body).count > 0 };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupEca(lat: number, lon: number, opts: EcaOptions = {}): Promise<EcaResult> {
  let layers: EcaLayer[] | null;
  try {
    layers = parseEcaLayers('layers' in opts ? opts.layers : process.env.SEATTLE_ECA_LAYERS);
  } catch {
    return { status: 'error' };
  }
  if (layers === null) return { status: 'not_configured' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { status: 'error' };
  const f = opts.fetch ?? fetch;
  try {
    const results = await Promise.all(layers.map((l) => layerPresent(l, lat, lon, f, opts.timeoutMs ?? 5000)));
    return { status: 'ok', layers: results };
  } catch {
    return { status: 'error' };
  }
}
