import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST, PUT } from './route';
const id = '00000000-0000-4000-8000-000000000001';
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());
describe('examination proxy', () => {
  it('forwards only allowed paths, authenticated headers, and expected methods', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetcher);
    const path = ['schools', id, 'assessments', id, 'marks'];
    const request = new NextRequest('http://localhost/api/examinations', { method: 'PUT', body: '{}', headers: { cookie: 'classloom_session=abc', origin: 'http://localhost:3000', 'x-classloom-request': '1', 'content-type': 'application/json' } });
    expect((await PUT(request, context(path))).status).toBe(200);
    expect(fetcher.mock.calls[0][0]).toContain(`/examinations/schools/${id}/assessments/${id}/marks`);
    expect(fetcher.mock.calls[0][1].headers.get('cookie')).toBe('classloom_session=abc');
    expect(fetcher.mock.calls[0][1].headers.get('x-classloom-request')).toBe('1');
    expect((await GET(new NextRequest('http://localhost/api/examinations'), context(path))).status).toBe(404);
    expect((await POST(new NextRequest('http://localhost/api/examinations', { method: 'POST', body: '{}' }), context(['schools', 'bad-id', 'exams']))).status).toBe(404);
    expect((await GET(new NextRequest('http://localhost/api/examinations'), context(['schools', id, '..', id, 'sheet']))).status).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('bounds streamed payloads and hides upstream failure details', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('database secret')); vi.stubGlobal('fetch', fetcher);
    expect((await POST(new NextRequest('http://localhost/api/examinations', { method: 'POST', body: 'x'.repeat(1_000_001) }), context(['schools', id, 'exams']))).status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
    const response = await GET(new NextRequest('http://localhost/api/examinations'), context(['schools']));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('database secret');
  });
});
