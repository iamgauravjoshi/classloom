// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StaffClient } from "./staff-client";

const api = vi.hoisted(() => ({
  listStaffSchools: vi.fn(), listStaff: vi.fn(), getStaff: vi.fn(), listEligibleAccounts: vi.fn(),
  createStaff: vi.fn(), updateStaff: vi.fn(), addStaffSchool: vi.fn(), updateTeacher: vi.fn(),
  linkStaffAccount: vi.fn(), unlinkStaffAccount: vi.fn(),
}));
vi.mock("@/lib/staff-api", () => api);
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));

const source = { id: "school-a", name: "School A", code: "A", canManageStaff: false };
const target = { id: "school-b", name: "School B", code: "B", canManageStaff: true };
const person = {
  id: "person-a", staffCode: "STAFF-1", givenName: "Asha", familyName: "Shah", preferredName: null,
  workEmail: null, phone: null, membershipId: null, schoolId: source.id, affiliationId: "aff-a",
  designation: "Assistant", startDate: null, kind: "staff", status: "active",
  qualification: null, specialization: null, canEditShared: false, canManageAffiliation: false,
};

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listStaffSchools.mockResolvedValue([source, target]);
  api.listStaff.mockResolvedValue({ items: [person], nextCursor: null });
  api.getStaff.mockResolvedValue(person);
  api.listEligibleAccounts.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("staff directory interactions", () => {
  it("shows loading until the directory request completes", async () => {
    let resolvePage!: (value: { items: typeof person[]; nextCursor: null }) => void;
    api.listStaff.mockReturnValue(new Promise((resolve) => { resolvePage = resolve; }));
    render(<StaffClient />);
    await screen.findByText("Directory");
    expect(screen.queryByText("No staff found")).toBeNull();
    resolvePage({ items: [], nextCursor: null });
    expect(await screen.findByText("No staff found")).toBeTruthy();
  });

  it("lets a source reader add a profile to a school they manage", async () => {
    const user = userEvent.setup();
    render(<StaffClient />);
    await user.click(await screen.findByRole("button", { name: "View" }));
    expect(await screen.findByText("Add another school")).toBeTruthy();
  });

  it("offers an All roles choice after a role filter is selected", async () => {
    const user = userEvent.setup();
    render(<StaffClient />);
    await screen.findByText("Asha Shah");
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    await user.click(await screen.findByRole("option", { name: "Teacher" }));
    await user.click(screen.getByRole("combobox", { name: "Role" }));
    expect(await screen.findByRole("option", { name: "All roles" })).toBeTruthy();
  });

  it("allows a school manager to promote an existing staff affiliation to teacher", async () => {
    const user = userEvent.setup();
    api.listStaffSchools.mockResolvedValue([{ ...source, canManageStaff: true }, target]);
    api.getStaff.mockResolvedValue({ ...person, canManageAffiliation: true });
    render(<StaffClient />);
    await user.click(await screen.findByRole("button", { name: "View" }));
    await waitFor(() => expect(screen.getByLabelText("Role at this school")).toBeTruthy());
  });

  it("shows the saved affiliation status before another edit", async () => {
    const user = userEvent.setup();
    let current = { ...person, canManageAffiliation: true };
    api.listStaffSchools.mockResolvedValue([{ ...source, canManageStaff: true }, target]);
    api.getStaff.mockImplementation(async () => current);
    api.updateStaff.mockImplementation(async () => { current = { ...current, status: "inactive" }; return current; });
    render(<StaffClient />);
    await user.click(await screen.findByRole("button", { name: "View" }));
    await screen.findByRole("button", { name: "Save school assignment" });
    await user.click(document.getElementById("staff-edit-status")!);
    await user.click(await screen.findByRole("option", { name: "Inactive" }));
    await user.click(screen.getByRole("button", { name: "Save school assignment" }));
    await waitFor(() => expect(api.updateStaff).toHaveBeenCalled());
    await waitFor(() => expect(document.getElementById("staff-edit-status")?.textContent).toContain("Inactive"));
  });
});
