import { apiRequest } from "./people-enrollment-request";
import type { GuardianCreate, StudentCreate, StudentGuardianRelationship } from "./students-api";

const prefix = "/api/enrollment/schools";
export type SchoolEnrollment = { id: string; studentId: string; schoolId: string; admissionNumber: string; admissionDate: string; status: "active" | "transferred" | "withdrawn" | "completed"; leavingDate: string | null; leavingReason: string | null };
export type AcademicEnrollment = { id: string; schoolEnrollmentId: string; studentId: string; sessionId: string; classId: string; sectionId: string; rollNumber: string | null; startDate: string; endDate: string | null; status: "active" | "transferred" | "withdrawn" | "completed"; reason: string | null };
export type PlacementInput = { sessionId: string; classId: string; sectionId: string; rollNumber?: string | null; startDate: string };
export type TransferInput = Omit<PlacementInput, "startDate"> & { effectiveDate: string; reason?: string | null };
export type CloseInput = { effectiveDate: string; reason?: string | null };
export type AdmissionInput = { student: StudentCreate; schoolEnrollment: { admissionNumber: string; admissionDate: string }; academicEnrollment: PlacementInput; guardians?: { guardian: GuardianCreate; relationship: Pick<StudentGuardianRelationship, "relationshipType"> & Partial<Pick<StudentGuardianRelationship, "primaryContact" | "emergencyContact" | "authorizedPickup" | "financialResponsibility" | "portalAccess">> }[] };

export const admitStudent = (schoolId: string, input: AdmissionInput) => apiRequest<{ student: { id: string }; schoolEnrollment: SchoolEnrollment; academicEnrollment: AcademicEnrollment }>(`${prefix}/${schoolId}/admissions`, "POST", input);

export const listSchoolEnrollments = (schoolId: string, studentId: string) => apiRequest<SchoolEnrollment[]>(`${prefix}/${schoolId}/students/${studentId}/school-enrollments`);
export const createSchoolEnrollment = (schoolId: string, studentId: string, input: { admissionNumber: string; admissionDate: string }) => apiRequest<SchoolEnrollment>(`${prefix}/${schoolId}/students/${studentId}/school-enrollments`, "POST", input);
export const listAcademicEnrollments = (schoolId: string, schoolEnrollmentId: string) => apiRequest<AcademicEnrollment[]>(`${prefix}/${schoolId}/school-enrollments/${schoolEnrollmentId}/academic-enrollments`);
export const createAcademicEnrollment = (schoolId: string, schoolEnrollmentId: string, input: PlacementInput) => apiRequest<AcademicEnrollment>(`${prefix}/${schoolId}/school-enrollments/${schoolEnrollmentId}/academic-enrollments`, "POST", input);
export const transferAcademicEnrollment = (schoolId: string, enrollmentId: string, input: TransferInput) => apiRequest<AcademicEnrollment>(`${prefix}/${schoolId}/academic-enrollments/${enrollmentId}/transfer`, "POST", input);
export const withdrawAcademicEnrollment = (schoolId: string, enrollmentId: string, input: CloseInput) => apiRequest<AcademicEnrollment>(`${prefix}/${schoolId}/academic-enrollments/${enrollmentId}/withdraw`, "POST", input);
export const completeAcademicEnrollment = (schoolId: string, enrollmentId: string, input: CloseInput) => apiRequest<AcademicEnrollment>(`${prefix}/${schoolId}/academic-enrollments/${enrollmentId}/complete`, "POST", input);
