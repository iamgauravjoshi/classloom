import type { NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_LIMIT = 16_384;

function allowed(method: string, path: string[]) {
  if (path.length === 1 && path[0] === 'schools') return method === 'GET';
  if (path[0] !== 'schools' || !uuid.test(path[1] ?? '')) return false;
  if (path.length === 4 && path[2] === 'sessions' && uuid.test(path[3] ?? '')) return method === 'GET';
  if (path.length === 5 && path[2] === 'sessions' && uuid.test(path[3] ?? '') && path[4] === 'slots') return method === 'POST';
  if (path.length === 5 && path[2] === 'sessions' && uuid.test(path[3] ?? '') && path[4] === 'publish') return method === 'POST';
  if (path.length === 4 && path[2] === 'slots' && uuid.test(path[3] ?? '')) return method === 'PATCH' || method === 'DELETE';
  return false;
}

async function boundedBody(request: NextRequest): Promise<ArrayBuffer | null | undefined> {
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!allowed(request.method, path)) return Response.json({ message: 'Not found' }, { status: 404 });
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > BODY_LIMIT) return Response.json({ message: 'Request body is too large' }, { status: 413 });
  const body = ['POST', 'PATCH'].includes(request.method) ? await boundedBody(request) : undefined;
  if (body === null) return Response.json({ message: 'Request body is too large' }, { status: 413 });
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'referer', 'x-classloom-request', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${API_BASE}/timetable/${path.join('/')}${request.nextUrl.search}`, {
      method: request.method, headers, body, cache: 'no-store',
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ message: 'Timetable service is unavailable' }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
