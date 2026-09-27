import { apiRequest, queryString } from "./people-enrollment-request";

const prefix = "/api/people/schools";
export type PersonStatus = "active" | "inactive";
export type Student = {
  id: string; studentCode: string; givenName: string; middleName: string | null; familyName: string;
  preferredName: string | null; dateOfBirth: string; gender: string | null; email: string | null; phone: string | null;
  membershipId: string | null; status: PersonStatus; canEditShared?: boolean; guardians?: StudentGuardianRelationship[];
};
export type Guardian = {
  id: string; guardianCode: string; givenName: string; middleName: string | null; familyName: string;
  preferredName: string | null; email: string | null; phone: string | null; occupation: string | null;
  addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null;
  postalCode: string | null; countryCode: string | null; membershipId: string | null; status: PersonStatus;
  students?: StudentGuardianRelationship[];
};
export type StudentGuardianRelationship = {
  id: string; studentId: string; guardianId: string; relationshipType: "mother" | "father" | "legal_guardian" | "grandparent" | "sibling" | "other";
  primaryContact: boolean; emergencyContact: boolean; authorizedPickup: boolean; financialResponsibility: boolean;
  portalAccess: boolean; status: PersonStatus;
};
export type StudentCreate = Pick<Student, "studentCode" | "givenName" | "familyName" | "dateOfBirth"> &
  Partial<Pick<Student, "middleName" | "preferredName" | "gender" | "email" | "phone">>;
export type GuardianCreate = Pick<Guardian, "guardianCode" | "givenName" | "familyName"> &
  Partial<Pick<Guardian, "middleName" | "preferredName" | "email" | "phone" | "occupation" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "countryCode">>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export type StudentFilters = { q?: string; status?: PersonStatus; sessionId?: string; classId?: string; sectionId?: string; cursor?: string; limit?: number };
export type GuardianFilters = { q?: string; status?: PersonStatus; cursor?: string; limit?: number };
export type EligiblePersonAccount = { id: string; email: string; displayName: string | null };
type RelationshipCreate = Pick<StudentGuardianRelationship, "guardianId" | "relationshipType"> & Partial<Pick<StudentGuardianRelationship,
  "primaryContact" | "emergencyContact" | "authorizedPickup" | "financialResponsibility" | "portalAccess" | "status">>;

export const listStudents = (schoolId: string, filters: StudentFilters = {}) => apiRequest<Page<Student>>(`${prefix}/${schoolId}/students${queryString(filters)}`);
export const getStudent = (schoolId: string, studentId: string) => apiRequest<Student>(`${prefix}/${schoolId}/students/${studentId}`);
export const createStudent = (schoolId: string, input: StudentCreate) => apiRequest<Student>(`${prefix}/${schoolId}/students`, "POST", input);
export const updateStudent = (schoolId: string, studentId: string, input: Partial<Omit<StudentCreate, "studentCode">> & { status?: PersonStatus }) => apiRequest<Student>(`${prefix}/${schoolId}/students/${studentId}`, "PATCH", input);
export const linkStudentAccount = (schoolId: string, studentId: string, membershipId: string) => apiRequest<Student>(`${prefix}/${schoolId}/students/${studentId}/account`, "PUT", { membershipId });
export const unlinkStudentAccount = (schoolId: string, studentId: string) => apiRequest<Student>(`${prefix}/${schoolId}/students/${studentId}/account`, "DELETE");

export const listGuardians = (schoolId: string, filters: GuardianFilters = {}) => apiRequest<Page<Guardian>>(`${prefix}/${schoolId}/guardians${queryString(filters)}`);
export const getGuardian = (schoolId: string, guardianId: string) => apiRequest<Guardian>(`${prefix}/${schoolId}/guardians/${guardianId}`);
export const createGuardian = (schoolId: string, input: GuardianCreate) => apiRequest<Guardian>(`${prefix}/${schoolId}/guardians`, "POST", input);
export const updateGuardian = (schoolId: string, guardianId: string, input: Partial<Omit<GuardianCreate, "guardianCode">> & { status?: PersonStatus }) => apiRequest<Guardian>(`${prefix}/${schoolId}/guardians/${guardianId}`, "PATCH", input);
export const linkGuardianAccount = (schoolId: string, guardianId: string, membershipId: string) => apiRequest<Guardian>(`${prefix}/${schoolId}/guardians/${guardianId}/account`, "PUT", { membershipId });
export const unlinkGuardianAccount = (schoolId: string, guardianId: string) => apiRequest<Guardian>(`${prefix}/${schoolId}/guardians/${guardianId}/account`, "DELETE");
export const listEligiblePersonAccounts = (schoolId: string, profileType: "student" | "guardian") => apiRequest<EligiblePersonAccount[]>(`${prefix}/${schoolId}/eligible-accounts?profileType=${profileType}`);
export const linkGuardianToStudent = (schoolId: string, studentId: string, input: RelationshipCreate) => apiRequest<StudentGuardianRelationship>(`${prefix}/${schoolId}/students/${studentId}/guardians`, "POST", input);
export const updateStudentGuardianRelationship = (schoolId: string, studentId: string, relationshipId: string, input: Partial<Omit<RelationshipCreate, "guardianId">>) => apiRequest<StudentGuardianRelationship>(`${prefix}/${schoolId}/students/${studentId}/guardians/${relationshipId}`, "PATCH", input);
