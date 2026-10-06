// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcademicSetupClient } from "./setup-client";

const api = vi.hoisted(() => ({
  listAcademicSchools: vi.fn(),
  getAcademicSetup: vi.fn(),
  listAcademicStaff: vi.fn(),
  addAcademicClass: vi.fn(),
  addAcademicSession: vi.fn(),
  addAcademicSubject: vi.fn(),
  addAcademicSection: vi.fn(),
  addAcademicAssignment: vi.fn(),
  activateAcademicSession: vi.fn(),
}));
vi.mock("@/lib/academics-api", () => api);
const school = { id: "school-a", name: "North School", code: "N" };
const session = {
  id: "session-a",
  schoolId: school.id,
  name: "2026–27",
  code: "2026",
  startDate: "2026-04-01",
  endDate: "2027-03-31",
  status: "active",
};
const setup = {
  school,
  sessions: [session],
  classes: [],
  sections: [],
  subjects: [],
  assignments: [],
  assignmentAccounts: [],
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
  api.listAcademicSchools.mockResolvedValue([school]);
  api.getAcademicSetup.mockResolvedValue(setup);
  api.listAcademicStaff.mockResolvedValue([]);
  api.addAcademicClass.mockResolvedValue({ id: "new-class" });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("academic setup task areas", () => {
  it("retains a session form draft when switching task tabs and reports missing dates", async () => {
    const user = userEvent.setup();
    render(<AcademicSetupClient />);
    await screen.findByRole("textbox", { name: "Session name" });
    await user.type(
      screen.getByRole("textbox", { name: "Session name" }),
      "2027–28",
    );
    await user.type(screen.getByRole("textbox", { name: "Code" }), "2027");
    await user.click(screen.getByRole("tab", { name: "Subjects" }));
    expect(screen.queryByRole("textbox", { name: "Session name" })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Sessions" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "Session name",
        }) as HTMLInputElement
      ).value,
    ).toBe("2027–28");
    await user.click(screen.getByRole("button", { name: "Create session" }));
    expect(screen.getByText("Choose a start date.")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Start date: Choose date (required)" })
        .getAttribute("aria-invalid"),
    ).toBe("true");
    expect(api.addAcademicSession).not.toHaveBeenCalled();
  });

  it("confirms a successful write when refresh fails and blocks duplicate creation until recovery", async () => {
    const user = userEvent.setup();
    render(<AcademicSetupClient />);
    await screen.findByRole("tab", { name: "Classes & sections" });
    await user.click(screen.getByRole("tab", { name: "Classes & sections" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Grade 1");
    await user.type(
      within(screen.getByRole("form", { name: "Add class" })).getByRole(
        "textbox",
        { name: "Code" },
      ),
      "G1",
    );
    api.getAcademicSetup.mockRejectedValueOnce(new Error("Connection lost"));
    await user.click(screen.getByRole("button", { name: "Add class" }));
    expect(await screen.findByText("Class created")).toBeTruthy();
    expect(screen.getByText("Refresh needed")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Add class" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: "Add class" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false),
    );
    expect(api.addAcademicClass).toHaveBeenCalledTimes(1);
  });

  it("offers readable empty records while keeping archived configuration read-only", async () => {
    api.getAcademicSetup.mockResolvedValue({
      ...setup,
      sessions: [{ ...session, status: "archived" }],
    });
    const user = userEvent.setup();
    render(<AcademicSetupClient />);
    await screen.findByRole("combobox", { name: "Academic session" });
    await user.click(
      screen.getByRole("combobox", { name: "Academic session" }),
    );
    await user.click(
      await screen.findByRole("option", { name: "2026–27 · archived" }),
    );
    await user.click(screen.getByRole("tab", { name: "Classes & sections" }));
    expect(screen.getByText("Archived session")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "No classes yet" }),
    ).toBeTruthy();
    expect(
      (screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement)
        .disabled ||
        !!screen
          .getByRole("textbox", { name: "Name" })
          .closest("fieldset[disabled]"),
    ).toBe(true);
    expect(api.addAcademicClass).not.toHaveBeenCalled();
  });
});
