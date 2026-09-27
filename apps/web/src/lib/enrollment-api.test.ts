import { afterEach, describe, expect, it, vi } from "vitest";
import { createSchoolEnrollment, listAcademicEnrollments, transferAcademicEnrollment } from "./enrollment-api";

afterEach(() => vi.unstubAllGlobals());

describe("enrollment API client", () => {
  it("uses the school scoped history route", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetcher);
    await listAcademicEnrollments("s", "e");
    expect(fetcher.mock.calls[0]![0]).toBe("/api/enrollment/schools/s/school-enrollments/e/academic-enrollments");
  });

  it("sends marked JSON mutations and preserves meaningful errors", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ id: "e" }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ message: "Section is full" }) });
    vi.stubGlobal("fetch", fetcher);
    await createSchoolEnrollment("s", "student", { admissionNumber: "A1", admissionDate: "2026-04-01" });
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "POST", headers: { "x-classloom-request": "1" } });
    await expect(transferAcademicEnrollment("s", "e", { sessionId: "sess", classId: "class", sectionId: "section", effectiveDate: "2026-04-02" })).rejects.toThrow("Section is full");
  });
});
