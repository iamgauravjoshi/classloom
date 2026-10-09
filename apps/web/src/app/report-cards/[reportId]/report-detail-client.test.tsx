// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { ReportDetailClient } from "./report-detail-client";
import { reportDetail, saveRemarks } from "@/lib/results-api";
vi.mock("@/lib/results-api", () => ({
  reportDetail: vi.fn(),
  saveRemarks: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const snapshot = {
  school: { name: "School" },
  exam: { name: "Term" },
  student: {
    name: "Asha",
    code: "S1",
    admissionNumber: "A1",
    dateOfBirth: "2018-03-04",
  },
  className: "Grade 1",
  sectionName: "A",
  sessionName: "2026",
  overall: {
    outcome: "incomplete",
    grade: null,
    percentage: null,
    earnedScore: 0,
    maximumScore: 0,
  },
  subjects: [
    {
      subjectId: "sub",
      name: "English",
      earnedScore: 0,
      maximumScore: 0,
      percentage: null,
      grade: null,
      outcome: "incomplete",
      assessments: [
        {
          id: "paper",
          label: "Written",
          date: "2026-09-15",
          status: "not_assessed",
          score: null,
          passingScore: 3500,
          maximumScore: 10000,
        },
      ],
    },
  ],
  policy: {
    name: "School grades",
    revision: 1,
    bands: [
      { grade: "A", minimumPercentage: 8000 },
      { grade: "F", minimumPercentage: 0 },
    ],
    overallPassingPercentage: 3500,
    requireSubjectPass: true,
  },
};
const draft = {
  report: { id: "report", snapshot, remarks: null },
  batch: { id: "batch", version: 2, edition: 1, status: "draft" },
  capabilities: {
    canRead: true,
    canManage: true,
    canApprove: false,
    canPublish: false,
    canExport: false,
  },
  canDownload: false,
};
describe("Report detail", () => {
  it("shows explicit incomplete coverage and retains the staff draft after validation failure", async () => {
    vi.mocked(reportDetail).mockResolvedValue(draft as never);
    vi.mocked(saveRemarks).mockRejectedValue(
      new Error("Refresh before saving"),
    );
    render(<ReportDetailClient id="report" />);
    await screen.findByRole("heading", { name: "Asha" });
    expect(screen.getByText("Not assessed")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    const field = screen.getByRole("textbox", { name: "Remarks" });
    fireEvent.change(field, {
      target: { value: "Student joined after this paper" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save remarks" }));
    await screen.findByText("Refresh before saving");
    expect((field as HTMLTextAreaElement).value).toBe(
      "Student joined after this paper",
    );
    expect(saveRemarks).toHaveBeenCalledWith(
      "report",
      draft.batch,
      "Student joined after this paper",
    );
  });
  it("renders a published personal report without staff editing controls", async () => {
    vi.mocked(reportDetail).mockResolvedValue({
      ...draft,
      batch: { ...draft.batch, status: "published" },
      capabilities: {
        canRead: false,
        canManage: false,
        canApprove: false,
        canPublish: false,
        canExport: false,
      },
      canDownload: true,
    } as never);
    render(<ReportDetailClient id="report" />);
    await screen.findByRole("heading", { name: "Asha" });
    expect(screen.queryByRole("textbox", { name: "Remarks" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "My report cards" })).toBeTruthy();
  });
  it("shows access errors without exposing report details and supports retry", async () => {
    vi.mocked(reportDetail)
      .mockRejectedValueOnce(new Error("This report is not available"))
      .mockResolvedValue(draft as never);
    render(<ReportDetailClient id="report" />);
    await screen.findByText("This report is not available");
    expect(screen.queryByText("Asha")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Asha" })).toBeTruthy(),
    );
  });
});
