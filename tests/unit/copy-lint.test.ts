// Lints user-facing copy for advice language (CLAUDE.md §3.2): every string literal and JSX text
// in app/, components/ and lib/legal/ must pass the banned-phrase check.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISCLAIMER_TEXT } from '@/lib/legal/disclaimer';
import { findBanned } from '@/lib/legal/banned-phrases';

const ROOTS = ['app', 'components', 'lib/legal', 'lib/email'];

function files(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out = out.concat(files(p));
    else if (/\.(tsx?|mdx?)$/.test(e) && !/\.test\.tsx?$/.test(e) && !e.startsWith('banned-phrases')) out.push(p);
  }
  return out;
}

/** String literals, template literals and JSX text runs. */
function copyIn(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/'([^'\\\n]|\\.){8,}'|"([^"\\\n]|\\.){8,}"|`([^`\\]|\\.){8,}`/g)) out.push(m[0].slice(1, -1));
  for (const m of src.matchAll(/>([^<>{}]{8,})</g)) out.push(m[1]!.trim());
  return out;
}

describe('user-facing copy contains no advice language', () => {
  const all = ROOTS.flatMap(files);

  it('found files to scan', () => {
    expect(all.length).toBeGreaterThan(3);
  });

  for (const f of all) {
    it(f, () => {
      const hits = copyIn(readFileSync(f, 'utf8')).flatMap((s) => findBanned(s).map((h) => `${h.id}: "${s}"`));
      expect(hits).toEqual([]);
    });
  }

  it('disclaimers are clean and mention not being advice', () => {
    for (const text of Object.values(DISCLAIMER_TEXT)) {
      expect(findBanned(text)).toEqual([]);
      expect(text).toMatch(/not (legal advice|an appraisal|a determination|a contract)/i);
    }
  });
});
