import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";

const context = (path: string[]) => ({ params: Promise.resolve({ path }) });
afterEach(() => vi.unstubAllGlobals());

describe("account service feedback", () => {
  it("returns actionable, uncached feedback without exposing an upstream failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(new Error("private internal connection details")),
    );
    const response = await POST(
      new NextRequest("http://localhost/api/auth/login", {
        method: "POST",
        body: "{}",
      }),
      context(["login"]),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message:
        "Account service is temporarily unavailable. Please try again shortly.",
    });
  });

  it("preserves server validation and refuses paths outside the auth contract", async () => {
    const payload = {
      message: "Password must contain at least 15 characters",
      details: {
        fields: { password: "Password must contain at least 15 characters" },
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json(payload, { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await POST(
      new NextRequest("http://localhost/api/auth/invitations/accept", {
        method: "POST",
        body: "{}",
      }),
      context(["invitations", "accept"]),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(payload);
    expect(
      (
        await GET(
          new NextRequest("http://localhost/api/auth/admin"),
          context(["admin"]),
        )
      ).status,
    ).toBe(404);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
