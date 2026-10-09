// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ResultsClient } from "./results-client";
import { resultSetup, resultEdition } from "@/lib/results-api";
vi.mock("@/components/workspace-context", () => ({
  useWorkspace: () => ({
    loading: false,
    failed: [],
    results: { schools: [{ id: "school", name: "School" }], canReadOwn: false },
  }),
}));
vi.mock("@/lib/results-api", () => ({
  resultSetup: vi.fn(),
  resultEdition: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
const capabilities = {
  canRead: true,
  canManage: true,
  canApprove: true,
  canPublish: true,
  canExport: true,
};
const batch = {
  id: "batch",
  examId: "exam",
  edition: 1,
  version: 2,
  status: "submitted",
  preparedByAccountId: "staff",
  submittedByAccountId: "staff",
};
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.mocked(resultSetup).mockResolvedValue({
    capabilities,
    exams: [{ id: "exam", name: "Term" }],
    policies: [],
    batches: [batch],
  } as never);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
describe("Result review safeguards", () => {
  it("shows reviewed student outcomes and requires a different account to approve", async () => {
    vi.mocked(resultEdition).mockResolvedValue({
      batch,
      capabilities,
      currentAccountId: "staff",
      sourceCurrent: true,
      events: [],
      reports: [
        {
          id: "report",
          snapshot: {
            student: { name: "Asha", admissionNumber: "A1" },
            sectionName: "A",
            overall: { percentage: 7999, grade: "B", outcome: "passed" },
          },
        },
      ],
    } as never);
    render(<ResultsClient />);
    await screen.findByText(
      "A different authorized staff account must approve this edition.",
    );
    expect(
      screen.queryByRole("button", { name: "Approve edition" }),
    ).toBeNull();
    const table = screen.getByRole("table");
    expect(within(table).getByText("79.99%")).toBeTruthy();
    expect(
      within(table)
        .getByRole("link", { name: "View report for Asha" })
        .getAttribute("href"),
    ).toBe("/report-cards/report");
  });
  it("blocks publication when marks have changed since approval", async () => {
    vi.mocked(resultEdition).mockResolvedValue({
      batch: { ...batch, status: "approved" },
      capabilities,
      currentAccountId: "reviewer",
      sourceCurrent: false,
      events: [],
      reports: [],
    } as never);
    render(<ResultsClient />);
    await screen.findByText("Marks need recalculation");
    expect(
      (
        screen.getByRole("button", {
          name: "Publish report cards",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
