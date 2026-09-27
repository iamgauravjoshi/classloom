import { afterEach, describe, expect, it, vi } from "vitest";
import { commitStudentImport, inspectStudentImport, previewStudentImport } from "./student-import-api";

afterEach(() => vi.unstubAllGlobals());

describe("student CSV import client", () => {
  const file = new File(["code,name\nS1,Asha"], "students.csv", { type: "text/csv" });
  it("forwards multipart without overriding its content type", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ headers: ["code", "name"], rowCount: 1, sampleRows: [] }) });
    vi.stubGlobal("fetch", fetcher);
    await inspectStudentImport("s", file);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include", headers: { "x-classloom-request": "1" } });
    expect(fetcher.mock.calls[0]![1].headers).not.toHaveProperty("content-type");
    expect(fetcher.mock.calls[0]![1].body).toBeInstanceOf(FormData);
  });

  it("uses the same mapping and idempotency key for commit", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ errors: [] }) });
    vi.stubGlobal("fetch", fetcher);
    const mapping = { studentCode: "code" };
    await previewStudentImport("s", file, mapping);
    await commitStudentImport("s", file, mapping, "retry-1");
    expect(fetcher.mock.calls[1]![1].headers["idempotency-key"]).toBe("retry-1");
    expect(fetcher.mock.calls[1]![1].body.get("mapping")).toBe(JSON.stringify(mapping));
  });

  it("rejects an oversized file before upload", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(inspectStudentImport("s", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv"))).rejects.toThrow("2 MiB");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
