// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NewAdmissionForm } from "./admission-form";

const api = vi.hoisted(() => ({
  listAdmissionSchools: vi.fn(),
  createAdmissionCase: vi.fn(),
}));
const academics = vi.hoisted(() => ({ getAcademicSetup: vi.fn() }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/admissions-api", () => api);
vi.mock("@/lib/academics-api", () => academics);
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  api.listAdmissionSchools.mockResolvedValue([
    {
      id: "school-a",
      name: "North School",
      code: "NORTH",
      canReadAdmissions: true,
      canManageAdmissions: true,
      canConvertAdmissions: true,
    },
  ]);
  api.createAdmissionCase.mockResolvedValue({
    id: "case-a",
    caseReference: "ADM-NEW001",
  });
  academics.getAcademicSetup.mockResolvedValue({
    sessions: [],
    classes: [],
    sections: [],
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("new admission form", () => {
  it("shows loading instead of a false access warning and recovers from a school request failure", async () => {
    let reject!: (reason: Error) => void;
    api.listAdmissionSchools.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const user = userEvent.setup();
    render(<NewAdmissionForm />);
    expect(
      screen.getByRole("status", { name: "Loading schools" }),
    ).toBeTruthy();
    expect(screen.queryByText("No school access")).toBeNull();
    reject(new Error("School service unavailable"));
    expect(await screen.findByText("Could not load schools")).toBeTruthy();
    expect(screen.queryByText("No school access")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry schools" }));
    expect(
      await screen.findByRole("textbox", { name: "Student given name" }),
    ).toBeTruthy();
  });
  it("saves a draft and opens the created case", async () => {
    const user = userEvent.setup();
    render(<NewAdmissionForm />);
    await user.type(
      await screen.findByRole("textbox", { name: "Student given name" }),
      "Asha",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Student family name" }),
      "Shah",
    );
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(api.createAdmissionCase).toHaveBeenCalledWith(
      "school-a",
      expect.objectContaining({
        status: "draft",
        studentGivenName: "Asha",
        studentFamilyName: "Shah",
        guardians: [],
      }),
    );
    expect(navigation.push).toHaveBeenCalledWith(
      "/admissions/case-a?school=school-a",
    );
  });

  it("keeps the form open and shows the API validation detail when saving fails", async () => {
    api.createAdmissionCase.mockRejectedValue(
      new Error("Student given name is required"),
    );
    const user = userEvent.setup();
    render(<NewAdmissionForm />);
    await user.type(
      await screen.findByRole("textbox", { name: "Student given name" }),
      "Asha",
    );
    await user.click(screen.getByRole("button", { name: "Create enquiry" }));
    expect(
      await screen.findByText("Student given name is required"),
    ).toBeTruthy();
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
