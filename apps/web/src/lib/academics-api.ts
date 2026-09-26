import { responseError } from "./api-error";

const prefix = "/api/academics";

export type AcademicSchool = { id: string; name: string; code: string };
export type AcademicSession = { id: string; schoolId: string; name: string; code: string; startDate: string; endDate: string; status: "draft" | "active" | "archived" };
export type AcademicClass = { id: string; sessionId: string; name: string; code: string; sortOrder: number };
export type AcademicSection = { id: string; sessionId: string; classId: string; name: string; code: string; capacity: number | null };
export type AcademicSubject = { id: string; sessionId: string; name: string; code: string };
export type AcademicAssignment = { id: string; sessionId: string; sectionId: string; subjectId: string; membershipId: string };
export type AcademicSetup = { school: AcademicSchool; sessions: AcademicSession[]; classes: AcademicClass[]; sections: AcademicSection[]; subjects: AcademicSubject[]; assignments: AcademicAssignment[]; assignmentAccounts: AcademicStaffAccount[] };
export type AcademicStaffAccount = { id: string; email: string; displayName: string | null };

async function request<T>(path: string, body?: Record<string, string | number | undefined>) {
  const response = await fetch(`${prefix}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include", cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json", "x-classloom-request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw responseError(data, "Academic setup could not be saved. Please try again.");
  return data as T;
}

export const listAcademicSchools = () => request<AcademicSchool[]>("schools");
export const getAcademicSetup = (schoolId: string) => request<AcademicSetup>(`schools/${schoolId}/setup`);
export const listAcademicStaff = (schoolId: string) => request<AcademicStaffAccount[]>(`schools/${schoolId}/staff`);
export const addAcademicSession = (schoolId: string, input: { name: string; code: string; startDate: string; endDate: string }) => request<AcademicSession>(`schools/${schoolId}/sessions`, input);
export const addAcademicClass = (schoolId: string, sessionId: string, input: { name: string; code: string }) => request<AcademicClass>(`schools/${schoolId}/sessions/${sessionId}/classes`, input);
export const addAcademicSubject = (schoolId: string, sessionId: string, input: { name: string; code: string }) => request<AcademicSubject>(`schools/${schoolId}/sessions/${sessionId}/subjects`, input);
export const addAcademicSection = (schoolId: string, classId: string, input: { name: string; code: string; capacity?: number }) => request<AcademicSection>(`schools/${schoolId}/classes/${classId}/sections`, input);
export const addAcademicAssignment = (schoolId: string, sectionId: string, input: { subjectId: string; membershipId: string }) => request<AcademicAssignment>(`schools/${schoolId}/sections/${sectionId}/assignments`, input);
export const activateAcademicSession = (schoolId: string, sessionId: string) => request<AcademicSession>(`schools/${schoolId}/sessions/${sessionId}/activate`, {});
