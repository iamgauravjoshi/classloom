import type { NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JSON_LIMIT = 16_384;
const MULTIPART_LIMIT = 2 * 1024 * 1024 + 32 * 1024;

function allowed(method: string, path: string[]): boolean {
  if (path.length < 4 || path[0] !== "schools" || !uuid.test(path[1] ?? "")) return false;
  if (path[2] === "imports") return path.length === 5 && path[3] === "students" && ["inspect", "preview", "commit"].includes(path[4]!) && method === "POST";
  if (path[2] === "students") return path.length === 5 && uuid.test(path[3] ?? "") && path[4] === "school-enrollments" && ["GET", "POST"].includes(method);
  if (path[2] === "school-enrollments") return path.length === 5 && uuid.test(path[3] ?? "") && path[4] === "academic-enrollments" && ["GET", "POST"].includes(method);
  if (path[2] === "academic-enrollments") return path.length === 5 && uuid.test(path[3] ?? "") && ["transfer", "withdraw", "complete"].includes(path[4]!) && method === "POST";
  return false;
}

async function boundedBody(request: NextRequest, limit: number): Promise<ArrayBuffer | null | undefined> {
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!allowed(request.method, path)) return Response.json({ message: "Not found" }, { status: 404 });
  const multipart = path[2] === "imports";
  const limit = multipart ? MULTIPART_LIMIT : JSON_LIMIT;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > limit) return Response.json({ message: multipart ? "CSV upload is too large" : "Request body is too large" }, { status: 413 });
  const body = request.method === "POST" ? await boundedBody(request, limit) : undefined;
  if (body === null) return Response.json({ message: multipart ? "CSV upload is too large" : "Request body is too large" }, { status: 413 });
  const headers = new Headers();
  for (const name of ["cookie", "origin", "referer", "x-classloom-request", "content-type", "idempotency-key"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${API_BASE}/enrollment/${path.join("/")}${request.nextUrl.search}`, { method: request.method, headers, body, cache: "no-store" });
    return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Enrollment service is unavailable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
