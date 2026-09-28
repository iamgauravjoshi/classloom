import type { NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_LIMIT = 128_000;

function allowed(method: string, path: string[]) {
  if (path.length === 1 && path[0] === 'schools') return method === 'GET';
  if (path[0] !== 'schools' || !uuid.test(path[1] ?? '')) return false;
  if (path.length === 3 && ['setup', 'enrollments', 'outstanding'].includes(path[2])) return method === 'GET';
  if (path.length === 3 && ['heads', 'plans', 'concessions', 'payments'].includes(path[2])) return method === 'POST';
  if (path.length === 4 && path[2] === 'statements' && uuid.test(path[3] ?? '')) return method === 'GET';
  if (path.length === 5 && path[2] === 'plans' && uuid.test(path[3] ?? '') && ['lines', 'assignments'].includes(path[4])) return method === 'POST';
  if (path.length === 4 && path[2] === 'payments' && uuid.test(path[3] ?? '')) return method === 'GET';
  if (path.length === 5 && path[2] === 'payments' && uuid.test(path[3] ?? '') && path[4] === 'reversal') return method === 'POST';
  return false;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!allowed(request.method, path)) return Response.json({ message: 'Not found' }, { status: 404 });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > BODY_LIMIT) return Response.json({ message: 'Finance request is too large' }, { status: 413 });
  const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;
  if (body && body.byteLength > BODY_LIMIT) return Response.json({ message: 'Finance request is too large' }, { status: 413 });
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'referer', 'x-classloom-request', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${API_BASE}/finance/${path.join('/')}`, { method: request.method, headers, body, cache: 'no-store' });
    return new Response(upstream.body, { status: upstream.status, headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store',
    } });
  } catch {
    return Response.json({ message: 'Finance service is unavailable. Try again shortly' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
