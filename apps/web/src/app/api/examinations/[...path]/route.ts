import type { NextRequest } from 'next/server';

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_LIMIT = 1_000_000;
function allowed(method: string, path: string[]) {
  if (path.length === 1 && path[0] === 'schools') return method === 'GET';
  if (path[0] !== 'schools' || !uuid.test(path[1] ?? '')) return false;
  if (path.length === 3) return (path[2] === 'setup' && method === 'GET') || (path[2] === 'exams' && method === 'POST');
  if (path.length !== 5 || !uuid.test(path[3] ?? '')) return false;
  if (path[2] === 'exams') return method === 'POST' && ['assessments', 'lifecycle'].includes(path[4]);
  if (path[2] !== 'assessments') return false;
  return (path[4] === 'sheet' && method === 'GET') || (path[4] === 'marks' && method === 'PUT') || (['review', 'corrections', 'decisions'].includes(path[4]) && method === 'POST');
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
  if (Number(request.headers.get('content-length') ?? '0') > BODY_LIMIT) return Response.json({ message: 'Examination request is too large' }, { status: 413 });
  const body = request.method === 'GET' ? undefined : await boundedBody(request);
  if (body === null) return Response.json({ message: 'Examination request is too large' }, { status: 413 });
  const headers = new Headers();
  for (const name of ['cookie', 'origin', 'referer', 'x-classloom-request', 'content-type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${API_BASE}/examinations/${path.join('/')}`, { method: request.method, headers, body, cache: 'no-store' });
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' } });
  } catch { return Response.json({ message: 'Examinations service is unavailable. Please try again.' }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
