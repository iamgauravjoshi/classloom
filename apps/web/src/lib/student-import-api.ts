import { responseError } from "./api-error";

export const STUDENT_CSV_MAX_BYTES = 2 * 1024 * 1024;
export type StudentCsvField = "studentCode" | "studentGivenName" | "studentMiddleName" | "studentFamilyName" | "studentPreferredName" | "dateOfBirth" | "studentGender" | "studentEmail" | "studentPhone" | "admissionNumber" | "sessionCode" | "classCode" | "sectionCode" | "rollNumber" | "guardianCode" | "guardianGivenName" | "guardianMiddleName" | "guardianFamilyName" | "guardianPreferredName" | "guardianEmail" | "guardianPhone" | "guardianOccupation" | "guardianAddressLine1" | "guardianAddressLine2" | "guardianCity" | "guardianState" | "guardianPostalCode" | "guardianCountryCode" | "relationshipType";
export type StudentCsvMapping = Partial<Record<StudentCsvField, string>>;
export type StudentImportInspection = { headers: string[]; rowCount: number; sampleRows: Record<string, string>[] };
export type StudentImportError = { row: number; field: StudentCsvField | "file" | "mapping"; message: string };
export type StudentImportPreview = { rowCount: number; commands: unknown[]; errors: StudentImportError[] };
export type StudentImportResult = { batchId: string; replayed: boolean; studentCount: number; guardianCount: number; enrollmentCount: number };

async function upload<T>(schoolId: string, action: "inspect" | "preview" | "commit", file: File, mapping?: StudentCsvMapping, idempotencyKey?: string): Promise<T> {
  if (file.size > STUDENT_CSV_MAX_BYTES) throw new Error("The CSV file must be 2 MiB or smaller");
  if (!file.size) throw new Error("Choose a non-empty CSV file");
  const form = new FormData();
  form.set("file", file);
  if (mapping) form.set("mapping", JSON.stringify(mapping));
  const headers: Record<string, string> = { "x-classloom-request": "1" };
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const response = await fetch(`/api/enrollment/schools/${schoolId}/imports/students/${action}`, {
    method: "POST", credentials: "include", cache: "no-store", headers, body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw responseError(data, "Student import could not be completed. Please try again.");
  return data as T;
}

export const inspectStudentImport = (schoolId: string, file: File) => upload<StudentImportInspection>(schoolId, "inspect", file);
export const previewStudentImport = (schoolId: string, file: File, mapping: StudentCsvMapping) => upload<StudentImportPreview>(schoolId, "preview", file, mapping);
export const commitStudentImport = (schoolId: string, file: File, mapping: StudentCsvMapping, idempotencyKey: string) => upload<StudentImportResult>(schoolId, "commit", file, mapping, idempotencyKey);
