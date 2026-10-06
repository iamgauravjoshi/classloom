// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "./app-shell";

const state = vi.hoisted(() => ({
  pathname: "/students/student-a",
  access: {
    people: [{ id: "school-a", name: "North School", canReadStudents: true }],
    academic: [],
    timetable: [],
    attendance: [],
    admissions: [{ id: "school-a", canManageAdmissions: true }],
    finance: [],
    examinations: [],
    loading: false,
    failed: [],
    retry: vi.fn(),
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("./workspace-context", () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
  useWorkspace: () => state.access,
}));
vi.mock("./logout-button", () => ({
  LogoutButton: () => <button>Sign out</button>,
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("workspace shell", () => {
  it("shows authorized navigation, identifies the current area, and provides a skip link", () => {
    render(
      <AppShell accountName="Asha Rao">
        <h1>Student profile</h1>
      </AppShell>,
    );
    const navigation = screen.getByRole("navigation", {
      name: "Main navigation",
    });
    expect(
      within(navigation)
        .getByRole("link", { name: "Students" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      within(navigation).getByRole("link", { name: "Admissions" }),
    ).toBeTruthy();
    expect(
      within(navigation).queryByRole("link", { name: "Fees & payments" }),
    ).toBeNull();
    expect(
      within(navigation).queryByRole("link", { name: "Staff & teachers" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Skip to content" })
        .getAttribute("href"),
    ).toBe("#main-content");
    expect(screen.getByRole("main").id).toBe("main-content");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("opens accessible mobile navigation and closes it after choosing a destination", async () => {
    const user = userEvent.setup();
    render(
      <AppShell>
        <h1>Student profile</h1>
      </AppShell>,
    );
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    const dialog = await screen.findByRole("dialog", { name: "ClassLoom" });
    expect(
      within(dialog).getByText("Navigate your school workspace."),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole("link", { name: "Overview" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
