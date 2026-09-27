// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "@/lib/api-error";
import { StudentImportClient } from "./student-import-client";

const api = vi.hoisted(() => ({ listPeopleSchools: vi.fn(), inspectStudentImport: vi.fn(), previewStudentImport: vi.fn(), commitStudentImport: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/students-api", () => ({ listPeopleSchools: api.listPeopleSchools }));
vi.mock("@/lib/student-import-api", () => ({ inspectStudentImport: api.inspectStudentImport, previewStudentImport: api.previewStudentImport, commitStudentImport: api.commitStudentImport, STUDENT_CSV_MAX_BYTES: 2 * 1024 * 1024, STUDENT_CSV_FIELDS: ["studentCode", "studentGivenName", "studentFamilyName", "dateOfBirth", "admissionNumber", "sessionCode", "classCode", "sectionCode"], STUDENT_CSV_REQUIRED_FIELDS: ["studentCode", "studentGivenName", "studentFamilyName", "dateOfBirth", "admissionNumber", "sessionCode", "classCode", "sectionCode"], STUDENT_CSV_GUARDIAN_REQUIRED_FIELDS: ["guardianCode", "guardianGivenName", "guardianFamilyName", "relationshipType"] }));
vi.mock("@/components/ui/toast", () => ({ toast: { add: api.toast } }));
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listPeopleSchools.mockResolvedValue([{ id: "school-a", name: "School A", canManageStudents: true, canManageGuardians: true, canManageEnrollment: true }]);
  api.inspectStudentImport.mockResolvedValue({ headers: ["studentCode", "studentGivenName", "studentFamilyName", "dateOfBirth", "admissionNumber", "sessionCode", "classCode", "sectionCode"], rowCount: 1, sampleRows: [] });
  api.previewStudentImport.mockResolvedValue({ rowCount: 1, commands: [{ student: { studentCode: "S1" }, sourceRows: [2], guardians: [] }], errors: [] });
  api.commitStudentImport.mockResolvedValue({ batchId: "batch-a", replayed: false, studentCount: 1, guardianCount: 0, enrollmentCount: 1 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("student CSV import", () => {
  it("rejects an oversized file before contacting the API", async () => {
    render(<StudentImportClient />);
    const input = await screen.findByLabelText("CSV file");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.csv", { type: "text/csv" })] } });
    expect(await screen.findByText(/2 MiB or smaller/)).toBeTruthy();
    expect(api.inspectStudentImport).not.toHaveBeenCalled();
  });

  it("inspects, previews, and commits a clean file", async () => {
    const user = userEvent.setup();
    render(<StudentImportClient />);
    const input = await screen.findByLabelText("CSV file");
    fireEvent.change(input, { target: { files: [new File(["studentCode\nS1"], "students.csv", { type: "text/csv" })] } });
    await user.click(await screen.findByRole("button", { name: "Inspect file" }));
    await user.click(await screen.findByRole("button", { name: "Preview rows" }));
    await user.click(await screen.findByRole("button", { name: "Import students" }));
    await waitFor(() => expect(api.commitStudentImport).toHaveBeenCalledOnce());
    expect(await screen.findByText("Import complete")).toBeTruthy();
  });

  it("shows row-level commit errors and blocks another attempt until fixed", async () => {
    const user = userEvent.setup();
    api.commitStudentImport.mockRejectedValueOnce(new ApiRequestError("Fix the CSV errors", {}, [{ row: 2, field: "studentCode", message: "Duplicate code" }]));
    render(<StudentImportClient />);
    fireEvent.change(await screen.findByLabelText("CSV file"), { target: { files: [new File(["studentCode\nS1"], "students.csv", { type: "text/csv" })] } });
    await user.click(await screen.findByRole("button", { name: "Inspect file" }));
    await user.click(await screen.findByRole("button", { name: "Preview rows" }));
    await user.click(await screen.findByRole("button", { name: "Import students" }));
    expect(await screen.findByText("Duplicate code")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Import students" }).hasAttribute("disabled")).toBe(true);
    expect(api.commitStudentImport).toHaveBeenCalledOnce();
  });

  it("reuses the idempotency key after a retryable commit failure", async () => {
    const user = userEvent.setup();
    api.commitStudentImport.mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce({ batchId: "batch-a", replayed: true, studentCount: 1, guardianCount: 0, enrollmentCount: 1 });
    render(<StudentImportClient />);
    fireEvent.change(await screen.findByLabelText("CSV file"), { target: { files: [new File(["studentCode\nS1"], "students.csv", { type: "text/csv" })] } });
    await user.click(await screen.findByRole("button", { name: "Inspect file" }));
    await user.click(await screen.findByRole("button", { name: "Preview rows" }));
    await user.click(await screen.findByRole("button", { name: "Import students" }));
    expect(await screen.findByText("Connection interrupted")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Import students" }));
    await waitFor(() => expect(api.commitStudentImport).toHaveBeenCalledTimes(2));
    expect(api.commitStudentImport.mock.calls[0]![3]).toBe(api.commitStudentImport.mock.calls[1]![3]);
    expect(await screen.findByText("Import complete")).toBeTruthy();
  });
});
