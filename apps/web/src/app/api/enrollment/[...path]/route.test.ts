import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const school = "00000000-0000-4000-8000-000000000001";
const student = "00000000-0000-4000-8000-000000000002";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());

describe("enrollment same-origin proxy", () => {
  it("rejects paths and methods outside the enrollment allowlist", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await GET(new NextRequest(`http://localhost/api/enrollment/schools/${school}/imports/students/commit`), context(["schools", school, "imports", "students", "commit"]));
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("forwards session, origin, mutation marker, and idempotency key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ batchId: "b" }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    const request = new NextRequest(`http://localhost/api/enrollment/schools/${school}/imports/students/commit`, {
      method: "POST", body: "payload", headers: { cookie: "classloom_session=abc", origin: "http://localhost", "content-type": "multipart/form-data; boundary=x", "x-classloom-request": "1", "idempotency-key": "retry-1" },
    });
    const response = await POST(request, context(["schools", school, "imports", "students", "commit"]));
    expect(response.status).toBe(200);
    const [, init] = fetcher.mock.calls[0]!;
    expect(init.headers.get("cookie")).toBe("classloom_session=abc");
    expect(init.headers.get("origin")).toBe("http://localhost");
    expect(init.headers.get("x-classloom-request")).toBe("1");
    expect(init.headers.get("idempotency-key")).toBe("retry-1");
  });

  it("rejects a bounded JSON body without contacting the API", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const request = new NextRequest(`http://localhost/api/enrollment/schools/${school}/students/${student}/school-enrollments`, { method: "POST", body: "x".repeat(16_385) });
    const response = await POST(request, context(["schools", school, "students", student, "school-enrollments"]));
    expect(response.status).toBe(413);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
