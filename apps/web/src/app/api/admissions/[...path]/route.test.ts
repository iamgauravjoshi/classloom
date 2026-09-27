import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';

const school = '00000000-0000-4000-8000-000000000001';
const caseId = '00000000-0000-4000-8000-000000000002';
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());

describe('admissions same-origin proxy', () => {
  it('allows the school picker, cases, and explicit lifecycle routes while rejecting arbitrary paths', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    expect((await GET(new NextRequest('http://localhost/api/admissions/schools'), context(['schools']))).status).toBe(200);
    expect((await POST(new NextRequest(`http://localhost/api/admissions/schools/${school}/cases/${caseId}/decision`, { method: 'POST', body: '{}' }), context(['schools', school, 'cases', caseId, 'decision']))).status).toBe(200);
    expect((await POST(new NextRequest(`http://localhost/api/admissions/schools/${school}/case-table/drop`, { method: 'POST', body: '{}' }), context(['schools', school, 'case-table', 'drop']))).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('forwards session, exact-origin, mutation marker, and query parameters', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(`http://localhost/api/admissions/schools/${school}/cases?q=Asha&limit=10`, {
      headers: { cookie: 'classloom_session=abc', origin: 'http://localhost:3000', referer: 'http://localhost:3000/admissions', 'x-classloom-request': '1' },
    });
    const response = await GET(request, context(['schools', school, 'cases']));
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[0]![0]).toContain('/admissions/schools/');
    expect(fetcher.mock.calls[0]![0]).toContain('q=Asha&limit=10');
    const [, init] = fetcher.mock.calls[0]!;
    expect(init.headers.get('cookie')).toBe('classloom_session=abc');
    expect(init.headers.get('origin')).toBe('http://localhost:3000');
    expect(init.headers.get('x-classloom-request')).toBe('1');
  });

  it('rejects a body over the JSON bound without contacting the API', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(`http://localhost/api/admissions/schools/${school}/cases`, { method: 'POST', body: 'x'.repeat(16_385) });
    const response = await POST(request, context(['schools', school, 'cases']));
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
