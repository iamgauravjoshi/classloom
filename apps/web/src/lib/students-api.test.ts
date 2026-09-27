import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudent, listStudents, createGuardian, linkGuardianToStudent } from "./students-api";

afterEach(() => vi.unstubAllGlobals());

describe("student and guardian API clients", () => {
  it("encodes directory filters and preserves the cursor", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) });
    vi.stubGlobal("fetch", fetcher);
    await listStudents("school-1", { q: "Asha & Priya", cursor: "next/page", status: "active" });
    const url = new URL(fetcher.mock.calls[0]![0], "http://localhost");
    expect(url.pathname).toBe("/api/people/schools/school-1/students");
    expect(url.searchParams.get("q")).toBe("Asha & Priya");
    expect(url.searchParams.get("cursor")).toBe("next/page");
  });

  it("marks mutations and exposes field errors", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "Check details", details: { fields: { givenName: "Name is too short" } } }) });
    vi.stubGlobal("fetch", fetcher);
    await expect(createStudent("school-1", { studentCode: "S1", givenName: "A", familyName: "Shah", dateOfBirth: "2015-01-01" })).rejects.toMatchObject({
      message: "Check details", fields: { givenName: "Name is too short" },
    });
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-classloom-request": "1" } });
  });

  it("sends guardian relationships to the student route", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "r1" }) });
    vi.stubGlobal("fetch", fetcher);
    await createGuardian("s", { guardianCode: "G1", givenName: "Mira", familyName: "Shah" });
    await linkGuardianToStudent("s", "student-1", { guardianId: "g1", relationshipType: "mother", primaryContact: true });
    expect(fetcher.mock.calls[1]![0]).toBe("/api/people/schools/s/students/student-1/guardians");
  });
});
