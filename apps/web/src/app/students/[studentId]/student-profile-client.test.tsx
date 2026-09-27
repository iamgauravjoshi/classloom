// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StudentProfileClient } from "./student-profile-client";

const people = vi.hoisted(() => ({ listPeopleSchools: vi.fn(), getStudent: vi.fn(), listEligiblePersonAccounts: vi.fn(), updateStudent: vi.fn(), linkStudentAccount: vi.fn(), unlinkStudentAccount: vi.fn(), updateStudentGuardianRelationship: vi.fn() }));
const enrollment = vi.hoisted(() => ({ listSchoolEnrollments: vi.fn(), listAcademicEnrollments: vi.fn(), createAcademicEnrollment: vi.fn(), transferAcademicEnrollment: vi.fn(), withdrawAcademicEnrollment: vi.fn(), completeAcademicEnrollment: vi.fn() }));
const academic = vi.hoisted(() => ({ getAcademicSetup: vi.fn() }));
vi.mock("@/lib/students-api", () => people);
vi.mock("@/lib/enrollment-api", () => enrollment);
vi.mock("@/lib/academics-api", () => academic);

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();
  people.listPeopleSchools.mockResolvedValue([{ id: "school-a", name: "School A", canReadStudents: true, canManageStudents: true, canManageEnrollment: true, canManageGuardians: true }]);
  people.getStudent.mockResolvedValue({ id: "student-a", studentCode: "S1", givenName: "Asha", familyName: "Shah", preferredName: null, dateOfBirth: "2015-01-01", status: "active", membershipId: null, canEditShared: true, guardians: [] });
  people.listEligiblePersonAccounts.mockResolvedValue([]);
  enrollment.listSchoolEnrollments.mockResolvedValue([{ id: "admission-a", admissionNumber: "A1", admissionDate: "2026-04-01", status: "active" }]);
  enrollment.listAcademicEnrollments.mockResolvedValue([]);
  academic.getAcademicSetup.mockResolvedValue({ sessions: [], classes: [], sections: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("student profile", () => {
  it("loads a scoped student and exposes profile tabs", async () => {
    render(<StudentProfileClient studentId="student-a" />);
    expect(await screen.findByRole("heading", { name: "Asha Shah", level: 1 })).toBeTruthy();
    expect(people.getStudent).toHaveBeenCalledWith("school-a", "student-a");
    for (const label of ["Overview", "Guardians", "Enrollment history", "Account access"]) expect(screen.getByRole("tab", { name: label })).toBeTruthy();
  });
});
