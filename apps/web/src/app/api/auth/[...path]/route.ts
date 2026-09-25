import type { NextRequest } from "next/server";

const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const allowedPaths = new Set([
  "login", "logout", "session", "memberships", "membership",
  "invitations/accept", "invitations/accept-existing",
  "password-reset/request", "password-reset/confirm",
]);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const authPath = path.join("/");
  if (!allowedPaths.has(authPath)) return Response.json({ message: "Not found" }, { status: 404 });

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const contentLength = request.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_AUTH_BODY_BYTES) {
      return Response.json({ message: "Request body is too large" }, { status: 413 });
    }
    const reader = request.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_AUTH_BODY_BYTES) {
          await reader.cancel();
          return Response.json({ message: "Request body is too large" }, { status: 413 });
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = bytes.buffer;
    }
  }

  const headers = new Headers();
  for (const name of ["cookie", "origin", "referer", "x-classloom-request", "x-forwarded-for", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const upstream = await fetch(`${API_BASE}/auth/${authPath}`, {
    method: request.method,
    headers,
    ...(body === undefined ? {} : { body }),
    cache: "no-store",
  });
  const responseHeaders = new Headers();
  const upstreamType = upstream.headers.get("content-type");
  if (upstreamType) responseHeaders.set("content-type", upstreamType);
  for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
  responseHeaders.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = proxy;
export const POST = proxy;
