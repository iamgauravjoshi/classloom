import type { NextRequest } from "next/server";

const API_BASE =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000/api/v1";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BODY_LIMIT = 1_000_000;
function allowed(method: string, path: string[]) {
  if (path.length === 1)
    return method === "GET" && ["access", "my-report-cards"].includes(path[0]);
  if (path[0] === "reports" && uuid.test(path[1] ?? ""))
    return (
      (path.length === 2 && method === "GET") ||
      (path.length === 3 &&
        ((path[2] === "pdf" && method === "GET") ||
          (path[2] === "remarks" && method === "PUT")))
    );
  if (path[0] !== "schools" || !uuid.test(path[1] ?? "")) return false;
  if (path.length === 3)
    return (
      (path[2] === "setup" && method === "GET") ||
      (["policies", "batches"].includes(path[2]) && method === "POST")
    );
  if (path[2] !== "batches" || !uuid.test(path[3] ?? "")) return false;
  return (
    (path.length === 4 && method === "GET") ||
    (path.length === 5 &&
      method === "POST" &&
      ["recalculate", "lifecycle"].includes(path[4]))
  );
}
async function boundedBody(
  request: NextRequest,
): Promise<ArrayBuffer | null | undefined> {
  const reader = request.body?.getReader();
  if (!reader) return undefined;
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > BODY_LIMIT) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}
async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!allowed(request.method, path))
    return Response.json({ message: "Not found" }, { status: 404 });
  if (Number(request.headers.get("content-length") ?? "0") > BODY_LIMIT)
    return Response.json(
      { message: "Results request is too large" },
      { status: 413 },
    );
  const body =
    request.method === "GET" ? undefined : await boundedBody(request);
  if (body === null)
    return Response.json(
      { message: "Results request is too large" },
      { status: 413 },
    );
  const headers = new Headers();
  for (const name of [
    "cookie",
    "origin",
    "referer",
    "x-classloom-request",
    "content-type",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  try {
    const upstream = await fetch(`${API_BASE}/results/${path.join("/")}`, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type":
          upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        ...(upstream.headers.get("content-disposition")
          ? {
              "content-disposition": upstream.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
      },
    });
  } catch {
    return Response.json(
      { message: "Resultss service is unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
