// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "@/lib/api-error";
import { StudentForm } from "./student-form";

vi.mock("../academic-setup/date-field", () => ({ DateField: ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) => <label htmlFor={id}>{label}<input id={id} value={value} onChange={(event) => onChange(event.target.value)} /></label> }));
const setup = {
  school: { id: "school-a", name: "School A", code: "A" },
  sessions: [{ id: "session-a", schoolId: "school-a", name: "2026–27", code: "2026", startDate: "2026-04-01", endDate: "2027-03-31", status: "active" as const }],
  classes: [{ id: "class-a", sessionId: "session-a", name: "Grade 5", code: "G5", sortOrder: 1 }],
  sections: [{ id: "section-a", sessionId: "session-a", classId: "class-a", name: "A", code: "A", capacity: 30 }],
  subjects: [], assignments: [], assignmentAccounts: [],
};
beforeEach(() => { vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("student admission form", () => {
  it("keeps server validation beside the relevant field", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new ApiRequestError("Check the student", { "student.givenName": "Enter at least two characters" }));
    render(<StudentForm setup={setup} busy={false} onSave={onSave} />);
    for (const [name, value] of [["Student code", "S1"], ["Given name", "Asha"], ["Family name", "Shah"], ["Date of birth", "2015-01-01"], ["Admission number", "A1"], ["Admission date", "2026-04-01"], ["Placement start date", "2026-04-01"]]) {
      fireEvent.change(screen.getByRole("textbox", { name }), { target: { value } });
    }
    for (const [name, option] of [["Session", "2026–27"], ["Class", "Grade 5"], ["Section", "A"]] as const) {
      await user.click(screen.getByRole("combobox", { name }));
      await user.click(await screen.findByRole("option", { name: option }));
    }
    await user.click(screen.getByRole("button", { name: "Admit student" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(await screen.findByText("Enter at least two characters")).toBeTruthy();
  });
});
