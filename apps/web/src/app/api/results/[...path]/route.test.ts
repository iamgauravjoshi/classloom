import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST, PUT } from "./route";
const uuid = "11111111-1111-4111-8111-111111111111";
const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());
describe("Results proxy boundary", () => {
  it("forwards authorized report PDF bytes and private download headers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("%PDF-test", {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": 'attachment; filename="report.pdf"',
          },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const request = new NextRequest(
      `http://localhost:3000/api/results/reports/${uuid}/pdf`,
      {
        headers: { cookie: "session=fixture", authorization: "do-not-forward" },
      },
    );
    const response = await GET(request, context(["reports", uuid, "pdf"]));
    expect(await response.text()).toBe("%PDF-test");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("report.pdf");
    const forwarded = fetch.mock.calls[0][1].headers;
    expect(forwarded.get("cookie")).toBe("session=fixture");
    expect(forwarded.get("authorization")).toBeNull();
  });
  it("rejects unlisted routes, methods and oversized bodies before reaching the API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      (
        await POST(
          new NextRequest("http://localhost:3000", { method: "POST" }),
          context(["reports", uuid, "pdf"]),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await GET(
          new NextRequest("http://localhost:3000"),
          context(["schools", uuid, "anything"]),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await PUT(
          new NextRequest("http://localhost:3000", {
            method: "PUT",
            body: "x".repeat(1000001),
          }),
          context(["reports", uuid, "remarks"]),
        )
      ).status,
    ).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("returns a useful service-unavailable response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const r = await GET(
      new NextRequest("http://localhost:3000"),
      context(["access"]),
    );
    expect(r.status).toBe(503);
    expect((await r.json()).message).toContain("unavailable");
  });
});
