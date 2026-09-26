import type { NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allowed(method: string, path: string[]) {
  if (path.length === 1 && path[0] === "schools") return method === "GET";
  if (path.length < 3 || path[0] !== "schools" || !uuid.test(path[1]!)) return false;
  if (path.length === 3) return path[2] === "staff" && (method === "GET" || method === "POST") || path[2] === "eligible-accounts" && method === "GET";
  if (path[2] !== "staff" || !uuid.test(path[3]!)) return false;
  if (path.length === 4) return method === "GET" || method === "PATCH";
  if (path.length !== 5) return false;
  return path[4] === "affiliations" && method === "POST" || path[4] === "teacher" && method === "PUT" || path[4] === "account" && (method === "PUT" || method === "DELETE");
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (!allowed(request.method, path)) return Response.json({ message: "Not found" }, { status: 404 });
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 16_384) return Response.json({ message: "Request body is too large" }, { status: 413 });
  let body: ArrayBuffer | undefined;
  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    const reader = request.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 16_384) { await reader.cancel(); return Response.json({ message: "Request body is too large" }, { status: 413 }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = bytes.buffer;
    }
  }
  const headers = new Headers();
  for (const name of ["cookie", "origin", "referer", "x-classloom-request", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${API_BASE}/people/${path.join("/")}${request.nextUrl.search}`, { method: request.method, headers, body, cache: "no-store" });
    return new Response(upstream.body, { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch {
    return Response.json({ message: "Staff service is unavailable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
