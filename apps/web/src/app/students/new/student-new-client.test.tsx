// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentNewClient } from "./student-new-client";

const api = vi.hoisted(() => ({ listPeopleSchools: vi.fn(), getAcademicSetup: vi.fn(), admitStudent: vi.fn(), push: vi.fn(), toast: vi.fn() }));
vi.mock("@/lib/students-api", () => ({ listPeopleSchools: api.listPeopleSchools }));
vi.mock("@/lib/academics-api", () => ({ getAcademicSetup: api.getAcademicSetup }));
vi.mock("@/lib/enrollment-api", () => ({ admitStudent: api.admitStudent }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: api.push }) }));
vi.mock("@/components/ui/toast", () => ({ toast: { add: api.toast } }));
vi.mock("../student-form", () => ({ StudentForm: ({ onSave }: { onSave: (value: object) => Promise<boolean> }) => <button onClick={() => void onSave({ student: { studentCode: "S1" } })}>Submit test admission</button> }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listPeopleSchools.mockResolvedValue([{ id: "school-a", name: "School A", code: "A", canManageStudents: true, canManageEnrollment: true }]);
  api.getAcademicSetup.mockResolvedValue({ sessions: [{ id: "session-a", name: "2026–27" }], classes: [], sections: [] });
  api.admitStudent.mockResolvedValue({ student: { id: "student-a" } });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("new student page", () => {
  it("navigates to the created student in the chosen school", async () => {
    const user = userEvent.setup();
    render(<StudentNewClient />);
    await user.click(await screen.findByRole("button", { name: "Submit test admission" }));
    expect(api.admitStudent).toHaveBeenCalledWith("school-a", { student: { studentCode: "S1" } });
    expect(api.push).toHaveBeenCalledWith("/students/student-a?school=school-a");
  });
});
