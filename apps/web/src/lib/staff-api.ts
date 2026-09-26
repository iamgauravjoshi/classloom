import { responseError } from "./api-error";

const prefix = "/api/people";

export type StaffSchool = { id: string; name: string; code: string; canManageStaff: boolean };
export type StaffRecord = {
  id: string; staffCode: string; givenName: string; familyName: string; preferredName: string | null;
  workEmail: string | null; phone: string | null; membershipId: string | null;
  schoolId: string; affiliationId: string; designation: string; startDate: string | null;
  kind: "staff" | "teacher"; status: "active" | "inactive";
  qualification: string | null; specialization: string | null; canEditShared?: boolean; canManageAffiliation?: boolean;
};
export type StaffPage = { items: StaffRecord[]; nextCursor: string | null };
export type StaffFilters = { q?: string; status?: "active" | "inactive"; kind?: "staff" | "teacher"; cursor?: string; limit?: number };
export type StaffCreate = {
  staffCode: string; givenName: string; familyName: string; preferredName?: string | null;
  workEmail?: string | null; phone?: string | null; designation: string; startDate?: string | null;
  kind: "staff" | "teacher"; status?: "active" | "inactive";
  qualification?: string | null; specialization?: string | null;
};
export type EligibleAccount = { id: string; email: string; displayName: string | null };

async function request<T>(path: string, method = "GET", body?: object): Promise<T> {
  const response = await fetch(`${prefix}/${path}`, {
    method, credentials: "include", cache: "no-store",
    headers: method === "GET" ? undefined : { "content-type": "application/json", "x-classloom-request": "1" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw responseError(data, "Staff details could not be saved. Please try again.");
  return data as T;
}

export const listStaffSchools = () => request<StaffSchool[]>("schools");
export function listStaff(schoolId: string, filters: StaffFilters = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== "") search.set(key, String(value));
  const query = search.toString();
  return request<StaffPage>(`schools/${schoolId}/staff${query ? `?${query}` : ""}`);
}
export const getStaff = (schoolId: string, staffId: string) => request<StaffRecord>(`schools/${schoolId}/staff/${staffId}`);
export const createStaff = (schoolId: string, input: StaffCreate) => request<StaffRecord>(`schools/${schoolId}/staff`, "POST", input);
export const updateStaff = (schoolId: string, staffId: string, input: { profile?: Partial<StaffCreate>; affiliation?: Partial<StaffCreate> }) => request<StaffRecord>(`schools/${schoolId}/staff/${staffId}`, "PATCH", input);
export const addStaffSchool = (schoolId: string, staffId: string, input: { targetSchoolId: string; designation: string; kind: "staff" | "teacher"; startDate?: string | null }) => request<StaffRecord>(`schools/${schoolId}/staff/${staffId}/affiliations`, "POST", input);
export const updateTeacher = (schoolId: string, staffId: string, input: { qualification?: string | null; specialization?: string | null }) => request<StaffRecord>(`schools/${schoolId}/staff/${staffId}/teacher`, "PUT", input);
export const listEligibleAccounts = (schoolId: string) => request<EligibleAccount[]>(`schools/${schoolId}/eligible-accounts`);
export const linkStaffAccount = (schoolId: string, staffId: string, membershipId: string) => request<StaffRecord>(`schools/${schoolId}/staff/${staffId}/account`, "PUT", { membershipId });
export const unlinkStaffAccount = (schoolId: string, staffId: string) => request<StaffRecord>(`schools/${schoolId}/staff/${staffId}/account`, "DELETE");
