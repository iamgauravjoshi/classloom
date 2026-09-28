import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const school = '00000000-0000-4000-8000-000000000001';
const item = '00000000-0000-4000-8000-000000000002';
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());

describe('finance same-origin proxy', () => {
  it('allows documented paths and rejects arbitrary backend traversal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    expect((await GET(new NextRequest('http://localhost/api/finance/schools'), context(['schools']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/finance/setup'), context(['schools', school, 'setup']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/finance/receipt'), context(['schools', school, 'payments', item]))).status).toBe(200);
    expect((await POST(new NextRequest('http://localhost/api/finance/payment', { method: 'POST', body: '{}' }), context(['schools', school, 'payments']))).status).toBe(200);
    expect((await POST(new NextRequest('http://localhost/api/finance/unknown', { method: 'POST', body: '{}' }), context(['schools', school, 'admin']))).status).toBe(404);
    expect((await GET(new NextRequest('http://localhost/api/finance/invalid'), context(['schools', 'bad-id', 'setup']))).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('forwards only session and CSRF headers and rejects oversized bodies', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest('http://localhost/api/finance/payment', { method: 'POST', body: '{}',
      headers: { cookie: 'classloom_session=abc', origin: 'http://localhost:3000', 'x-classloom-request': '1', authorization: 'Bearer leak' } });
    expect((await POST(request, context(['schools', school, 'payments']))).status).toBe(200);
    const [, init] = fetcher.mock.calls[0]!;
    expect(init.headers.get('cookie')).toBe('classloom_session=abc');
    expect(init.headers.get('x-classloom-request')).toBe('1');
    expect(init.headers.get('authorization')).toBeNull();
    const huge = new NextRequest('http://localhost/api/finance/payment', { method: 'POST', body: 'x'.repeat(128_001) });
    expect((await POST(huge, context(['schools', school, 'payments']))).status).toBe(413);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
