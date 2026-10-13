import { beforeEach, describe, expect, it, vi } from 'vitest';

const currentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ currentUser: () => currentUser() }));
vi.mock('@/lib/db/client', () => ({ withUser: vi.fn(() => Promise.reject(new Error('db must not be reached'))) }));
vi.mock('@/lib/storage/documents', () => ({ downloadPdf: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({ default: class {} }));

import { POST } from '@/app/api/review/route';

const req = (body: unknown) =>
  new Request('http://x/api/review', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('POST /api/review (pre-stream checks)', () => {
  beforeEach(() => currentUser.mockReset());

  it('401 when signed out', async () => {
    currentUser.mockResolvedValue(null);
    expect((await POST(req({ documentId: crypto.randomUUID() }))).status).toBe(401);
  });
  it.each([['not json'], [{}], [{ documentId: 'nope' }], [{ documentId: 5 }]])('400 on bad body %j', async (b) => {
    currentUser.mockResolvedValue({ id: crypto.randomUUID(), email: 'a@b.c' });
    expect((await POST(req(b as never))).status).toBe(400);
  });
});
