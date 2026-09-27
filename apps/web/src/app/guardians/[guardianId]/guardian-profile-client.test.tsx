// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GuardianProfileClient } from "./guardian-profile-client";

const api = vi.hoisted(() => ({ listPeopleSchools: vi.fn(), getGuardian: vi.fn(), listEligiblePersonAccounts: vi.fn(), updateGuardian: vi.fn(), linkGuardianAccount: vi.fn(), unlinkGuardianAccount: vi.fn() }));
vi.mock("@/lib/students-api", () => api);
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  api.listPeopleSchools.mockResolvedValue([{ id: "school-a", name: "School A", canReadGuardians: true, canManageGuardians: true }]);
  api.getGuardian.mockResolvedValue({ id: "guardian-a", guardianCode: "G1", givenName: "Mira", familyName: "Shah", preferredName: null, status: "active", membershipId: null, students: [], canEditShared: true });
  api.listEligiblePersonAccounts.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("guardian profile", () => {
  it("loads a school scoped guardian and shows linked student context", async () => {
    render(<GuardianProfileClient guardianId="guardian-a" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Mira Shah" })).toBeTruthy();
    expect(api.getGuardian).toHaveBeenCalledWith("school-a", "guardian-a");
    expect(screen.getByText("No students linked")).toBeTruthy();
  });
});
