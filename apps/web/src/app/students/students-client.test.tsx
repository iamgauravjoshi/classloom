// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentsClient } from "./students-client";

const api = vi.hoisted(() => ({ listPeopleSchools: vi.fn(), listStudents: vi.fn(), listGuardians: vi.fn() }));
const academics = vi.hoisted(() => ({ getAcademicSetup: vi.fn() }));
vi.mock("@/lib/students-api", () => api);
vi.mock("@/lib/academics-api", () => academics);
const school = { id: "school-a", name: "School A", code: "A", canReadStudents: true, canManageStudents: true, canReadGuardians: true, canManageGuardians: true, canManageEnrollment: true };

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listPeopleSchools.mockResolvedValue([school]);
  api.listStudents.mockResolvedValue({ items: [{ id: "student-a", studentCode: "S1", givenName: "Asha", preferredName: null, familyName: "Shah", status: "active", dateOfBirth: "2015-01-01" }], nextCursor: null });
  academics.getAcademicSetup.mockResolvedValue({ sessions: [], classes: [], sections: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("students directory", () => {
  it("keeps loading visible until the student request resolves", async () => {
    let resolvePage!: (value: { items: never[]; nextCursor: null }) => void;
    api.listStudents.mockReturnValue(new Promise((resolve) => { resolvePage = resolve; }));
    render(<StudentsClient />);
    await screen.findByText("Student directory");
    expect(screen.queryByText("No students found")).toBeNull();
    resolvePage({ items: [], nextCursor: null });
    expect(await screen.findByText("No students found")).toBeTruthy();
  });

  it("shows a student profile link and clears filters when the school changes", async () => {
    const user = userEvent.setup();
    api.listPeopleSchools.mockResolvedValue([school, { ...school, id: "school-b", name: "School B" }]);
    render(<StudentsClient />);
    expect((await screen.findByRole("link", { name: /Asha Shah/ })).getAttribute("href")).toBe("/students/student-a?school=school-a");
    await user.type(screen.getByRole("textbox", { name: "Search students" }), "Asha");
    await user.click(screen.getByRole("combobox", { name: "School" }));
    await user.click(await screen.findByRole("option", { name: "School B" }));
    await waitFor(() => expect(api.listStudents).toHaveBeenCalledWith("school-b", expect.objectContaining({ q: undefined, cursor: undefined })));
    expect(screen.getByRole("textbox", { name: "Search students" })).toHaveProperty("value", "");
  });
});
