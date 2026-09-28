import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT } from './route';

const school = '00000000-0000-4000-8000-000000000001';
const session = '00000000-0000-4000-8000-000000000002';
const section = '00000000-0000-4000-8000-000000000003';
const register = '00000000-0000-4000-8000-000000000004';
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });

afterEach(() => vi.unstubAllGlobals());

describe('attendance same-origin proxy', () => {
  it('allows only the documented Attendance GET and PUT routes', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    expect((await GET(new NextRequest('http://localhost/api/attendance/schools'), context(['schools']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/attendance/sessions'), context(['schools', school, 'sessions']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/attendance/sections'), context(['schools', school, 'sessions', session, 'sections']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/attendance/register'), context(['schools', school, 'sessions', session, 'register']))).status).toBe(200);
    expect((await PUT(new NextRequest('http://localhost/api/attendance/register', { method: 'PUT', body: '{"entries":[]}' }), context(['schools', school, 'sessions', session, 'register']))).status).toBe(200);
    expect((await GET(new NextRequest('http://localhost/api/attendance/events'), context(['schools', school, 'registers', register, 'events']))).status).toBe(200);
    expect((await PUT(new NextRequest('http://localhost/api/attendance/unknown', { method: 'PUT', body: '{}' }), context(['schools', school, 'admin']))).status).toBe(404);
    expect((await GET(new NextRequest('http://localhost/api/attendance/invalid'), context(['schools', 'bad-id', 'sessions']))).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it('forwards the host-only session, CSRF markers, query string, and disables caching', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"entries":[]}', { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(`http://localhost/api/attendance/schools/${school}/sessions/${session}/register?date=2026-09-28&sectionId=${section}`, {
      method: 'PUT', body: '{"entries":[]}',
      headers: { cookie: 'classloom_session=abc', origin: 'http://localhost:3000', referer: 'http://localhost:3000/attendance', 'x-classloom-request': '1', 'content-type': 'application/json' },
    });
    const response = await PUT(request, context(['schools', school, 'sessions', session, 'register']));
    expect(response.headers.get('cache-control')).toBe('no-store');
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain('/attendance/schools/');
    expect(url).toContain(`sectionId=${section}`);
    expect(init.headers.get('cookie')).toBe('classloom_session=abc');
    expect(init.headers.get('origin')).toBe('http://localhost:3000');
    expect(init.headers.get('x-classloom-request')).toBe('1');
    expect(init.headers.get('authorization')).toBeNull();
  });

  it('rejects oversized payloads before contacting the API', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const request = new NextRequest(`http://localhost/api/attendance/schools/${school}/sessions/${session}/register`, {
      method: 'PUT', body: 'x'.repeat(512_001),
    });
    expect((await PUT(request, context(['schools', school, 'sessions', session, 'register']))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns a safe service-unavailable response when upstream fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('internal upstream details')));
    const response = await GET(new NextRequest('http://localhost/api/attendance/schools'), context(['schools']));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ message: 'Attendance service is unavailable' });
  });
});
