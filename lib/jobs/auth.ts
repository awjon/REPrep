import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time bearer check. Both sides are hashed first so the comparison is always
 * over equal-length buffers: a length mismatch neither throws nor short-circuits.
 */
export function checkBearer(header: string | null, expected: string): boolean {
  if (!header || !expected) return false;
  const m = /^\s*bearer\s+(\S+)\s*$/i.exec(header);
  if (!m) return false;
  const a = createHash('sha256').update(m[1]!).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
