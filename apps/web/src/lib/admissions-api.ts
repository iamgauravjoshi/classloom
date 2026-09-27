import { apiRequest, queryString } from './people-enrollment-request';

const prefix = '/api/admissions';

export type AdmissionStatus = 'enquiry' | 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn' | 'admitted';
export type AdmissionSchool = { id: string; name: string; code: string; canReadAdmissions: boolean; canManageAdmissions: boolean; canConvertAdmissions: boolean };
export type AdmissionGuardian = {
  id?: string; ordinal?: number; guardianProfileId?: string | null; guardianCode?: string | null;
  givenName: string; middleName?: string | null; familyName: string; preferredName?: string | null;
  email?: string | null; phone?: string | null; occupation?: string | null; addressLine1?: string | null;
  addressLine2?: string | null; city?: string | null; state?: string | null; postalCode?: string | null; countryCode?: string | null;
  relationshipType: 'mother' | 'father' | 'legal_guardian' | 'grandparent' | 'sibling' | 'other';
  primaryContact?: boolean; emergencyContact?: boolean; authorizedPickup?: boolean; financialResponsibility?: boolean; portalAccess?: boolean;
};
export type AdmissionCase = {
  id: string; caseReference: string; tenantId: string; schoolId: string; status: AdmissionStatus;
  studentGivenName: string | null; studentMiddleName: string | null; studentFamilyName: string | null; studentPreferredName: string | null;
  studentDateOfBirth: string | null; studentGender: string | null; studentEmail: string | null; studentPhone: string | null;
  existingStudentId: string | null; requestedSessionId: string | null; requestedClassId: string | null; requestedSectionId: string | null;
  reviewNote: string | null; decisionNote: string | null; convertedStudentId: string | null;
  convertedSchoolEnrollmentId: string | null; convertedAcademicEnrollmentId: string | null; createdAt: string; updatedAt: string;
  guardians: AdmissionGuardian[];
};
export type AdmissionEvent = { id: string; eventType: string; fromStatus: AdmissionStatus | null; toStatus: AdmissionStatus; createdAt: string; actorAccountId: string; actorMembershipId: string };
export type AdmissionPage = { items: AdmissionCase[]; nextCursor: string | null };
export type AdmissionFilters = { q?: string; status?: AdmissionStatus; requestedSessionId?: string; createdFrom?: string; createdTo?: string; cursor?: string; limit?: number };
export type AdmissionCaseInput = {
  status?: 'enquiry' | 'draft'; studentGivenName?: string | null; studentMiddleName?: string | null;
  studentFamilyName?: string | null; studentPreferredName?: string | null; studentDateOfBirth?: string | null;
  studentGender?: string | null; studentEmail?: string | null; studentPhone?: string | null; existingStudentId?: string | null;
  requestedSessionId?: string | null; requestedClassId?: string | null; requestedSectionId?: string | null;
  reviewNote?: string | null; decisionNote?: string | null; guardians?: AdmissionGuardian[];
};
export type AdmissionsConversionInput = {
  existingStudentId?: string; studentCode?: string;
  schoolEnrollment: { admissionNumber: string; admissionDate: string };
  academicEnrollment: { sessionId: string; classId: string; sectionId: string; rollNumber?: string | null; startDate: string };
  guardianCodes?: string[];
};

export const listAdmissionSchools = () => apiRequest<AdmissionSchool[]>(`${prefix}/schools`);
export const listAdmissionCases = (schoolId: string, filters: AdmissionFilters = {}) => apiRequest<AdmissionPage>(`${prefix}/schools/${schoolId}/cases${queryString(filters)}`);
export const getAdmissionCase = (schoolId: string, caseId: string) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}`);
export const createAdmissionCase = (schoolId: string, input: AdmissionCaseInput) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases`, 'POST', input);
export const updateAdmissionCase = (schoolId: string, caseId: string, input: AdmissionCaseInput) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}`, 'PATCH', input);
export const transitionAdmissionCase = (schoolId: string, caseId: string, action: 'draft' | 'submit') => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}/${action}`, 'POST', {});
export const reviewAdmissionCase = (schoolId: string, caseId: string, action: 'start_review' | 'return_to_draft', note?: string) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}/review`, 'POST', { action, ...(note ? { note } : {}) });
export const decideAdmissionCase = (schoolId: string, caseId: string, action: 'accept' | 'reject', note: string) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}/decision`, 'POST', { action, note });
export const withdrawAdmissionCase = (schoolId: string, caseId: string, note: string) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}/withdraw`, 'POST', { note });
export const admitAdmissionCase = (schoolId: string, caseId: string, input: AdmissionsConversionInput) => apiRequest<AdmissionCase>(`${prefix}/schools/${schoolId}/cases/${caseId}/admit`, 'POST', input);
export const listAdmissionCaseEvents = (schoolId: string, caseId: string) => apiRequest<AdmissionEvent[]>(`${prefix}/schools/${schoolId}/cases/${caseId}/events`);
