import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE, GET, PATCH, POST } from './route';

const school = '00000000-0000-4000-8000-000000000001';
const session = '00000000-0000-4000-8000-000000000002';
const slot = '00000000-0000-4000-8000-000000000003';
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => vi.unstubAllGlobals());

describe('timetable same-origin proxy', () => {
  it('allows only documented timetable routes and methods', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const readPath = ['schools', school, 'sessions', session];
    expect((await GET(new NextRequest('http://localhost/api/timetable/schools'), context(['schools']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/timetable/schools'), context(readPath))).status).toBe(200);
    expect((await POST(new NextRequest('http://localhost/api/timetable/publish', { method: 'POST', body: '{}' }), context([...readPath, 'publish']))).status).toBe(200);
    expect((await DELETE(new NextRequest(`http://localhost/api/timetable/slots/${slot}`, { method: 'DELETE' }), context(['schools', school, 'slots', slot]))).status).toBe(200);
    expect((await POST(new NextRequest('http://localhost/api/timetable/arbitrary', { method: 'POST', body: '{}' }), context(['schools', school, 'admin']))).status).toBe(404);
    expect((await PATCH(new NextRequest('http://localhost/api/timetable/invalid', { method: 'PATCH', body: '{}' }), context(['schools', school, 'sessions', session, 'publish']))).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it('forwards session, CSRF headers, and query parameters without caching', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slots: [] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(`http://localhost/api/timetable/schools/${school}/sessions/${session}?sectionId=${slot}`, {
      headers: { cookie: 'classloom_session=abc', origin: 'http://localhost:3000', referer: 'http://localhost:3000/timetable', 'x-classloom-request': '1' },
    });
    const response = await GET(request, context(['schools', school, 'sessions', session]));
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain('/timetable/schools/');
    expect(url).toContain(`sectionId=${slot}`);
    expect(init.headers.get('cookie')).toBe('classloom_session=abc');
    expect(init.headers.get('origin')).toBe('http://localhost:3000');
    expect(init.headers.get('x-classloom-request')).toBe('1');
  });

  it('rejects an oversized JSON body without contacting the API', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(`http://localhost/api/timetable/schools/${school}/sessions/${session}/slots`, {
      method: 'POST', body: 'x'.repeat(16_385),
    });
    const response = await POST(request, context(['schools', school, 'sessions', session, 'slots']));
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a safe unavailable response when the API cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network details')));
    const response = await GET(new NextRequest('http://localhost/api/timetable/schools'), context(['schools']));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Timetable service is unavailable' });
  });
});
