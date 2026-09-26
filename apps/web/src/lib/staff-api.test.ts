import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "./api-error";
import { createStaff, listStaff } from "./staff-api";

afterEach(() => vi.unstubAllGlobals());

describe("staff API client", () => {
  it("encodes directory filters and a page cursor", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) });
    vi.stubGlobal("fetch", fetcher);
    await listStaff("school-1", { q: "Asha & Priya", kind: "teacher", cursor: "next/page" });
    const url = fetcher.mock.calls[0]![0] as string;
    expect(url).toContain("/api/people/schools/school-1/staff?");
    expect(new URL(url, "http://localhost").searchParams.get("q")).toBe("Asha & Priya");
    expect(new URL(url, "http://localhost").searchParams.get("cursor")).toBe("next/page");
  });

  it("sends the mutation marker and preserves field errors", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Check staff details", details: { fields: { givenName: "Enter at least two characters" } } }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(createStaff("school-1", { staffCode: "A1", givenName: "A", familyName: "Shah", designation: "Teacher", kind: "teacher" })).rejects.toMatchObject({
      message: "Check staff details", fields: { givenName: "Enter at least two characters" },
    } satisfies Partial<ApiRequestError>);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "POST", headers: { "x-classloom-request": "1" } });
  });
});
