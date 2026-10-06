import type { ReportSnapshot, GradeBand } from "@classloom/db";
import { scoreToHundredths, type Exam } from "./examinations-api";
import { apiRequest } from "./people-enrollment-request";
export type ResultCapabilities = {
  canRead: boolean;
  canManage: boolean;
  canApprove: boolean;
  canPublish: boolean;
  canExport: boolean;
};
export function percentageToBasisPoints(value: string) {
  try {
    return scoreToHundredths(value, 10000);
  } catch {
    throw new Error(
      "Enter a percentage between 0 and 100, with at most two decimal places",
    );
  }
}
export type ResultSchool = ResultCapabilities & { id: string; name: string };
export type ResultAccess = { schools: ResultSchool[]; canReadOwn: boolean };
export type ResultPolicy = {
  id: string;
  name: string;
  revision: number;
  bands: GradeBand[];
  overallPassingPercentage: number;
  requireSubjectPass: boolean;
};
export type ResultBatch = {
  id: string;
  examId: string;
  edition: number;
  status:
    | "draft"
    | "submitted"
    | "approved"
    | "published"
    | "superseded"
    | "withdrawn";
  version: number;
  preparedByAccountId: string;
  submittedByAccountId: string | null;
  publishedAt: string | null;
};
export type ResultReport = {
  id: string;
  batchId: string;
  schoolId: string;
  studentId: string;
  sectionId: string;
  snapshot: ReportSnapshot;
  remarks: string | null;
};
export type ResultSetup = {
  capabilities: ResultCapabilities;
  exams: Exam[];
  policies: ResultPolicy[];
  batches: ResultBatch[];
};
export type ResultEdition = {
  batch: ResultBatch;
  reports: ResultReport[];
  events: {
    id: string;
    eventType: string;
    createdAt: string;
    details: { reason?: string | null };
  }[];
  sourceCurrent: boolean;
  capabilities: ResultCapabilities;
  currentAccountId: string;
};
export type ReportDetail = {
  report: ResultReport;
  batch: ResultBatch;
  capabilities: ResultCapabilities;
  canDownload: boolean;
};
export type ResultAction =
  "submit" | "return" | "approve" | "publish" | "withdraw";
export const resultAccess = () =>
  apiRequest<ResultAccess>("/api/results/access");
export const resultSetup = (schoolId: string) =>
  apiRequest<ResultSetup>(`/api/results/schools/${schoolId}/setup`);
export const resultEdition = (schoolId: string, id: string) =>
  apiRequest<ResultEdition>(`/api/results/schools/${schoolId}/batches/${id}`);
export const createPolicy = (
  schoolId: string,
  input: Omit<ResultPolicy, "id" | "revision"> & { idempotencyKey: string },
) =>
  apiRequest<ResultPolicy>(
    `/api/results/schools/${schoolId}/policies`,
    "POST",
    input,
  );
export const generateResults = (
  schoolId: string,
  input: { examId: string; gradingPolicyId: string; idempotencyKey: string },
) =>
  apiRequest<ResultBatch>(
    `/api/results/schools/${schoolId}/batches`,
    "POST",
    input,
  );
export const recalculateResults = (schoolId: string, batch: ResultBatch) =>
  apiRequest<ResultBatch>(
    `/api/results/schools/${schoolId}/batches/${batch.id}/recalculate`,
    "POST",
    { expectedVersion: batch.version },
  );
export const resultLifecycle = (
  schoolId: string,
  batch: ResultBatch,
  action: ResultAction,
  reason?: string,
) =>
  apiRequest<ResultBatch>(
    `/api/results/schools/${schoolId}/batches/${batch.id}/lifecycle`,
    "POST",
    { expectedVersion: batch.version, action, reason },
  );
export const myReports = () =>
  apiRequest<{ report: ResultReport; batch: ResultBatch }[]>(
    "/api/results/my-report-cards",
  );
export const reportDetail = (id: string) =>
  apiRequest<ReportDetail>(`/api/results/reports/${id}`);
export const saveRemarks = (
  id: string,
  batch: ResultBatch,
  remarks: string | null,
) =>
  apiRequest(`/api/results/reports/${id}/remarks`, "PUT", {
    expectedVersion: batch.version,
    remarks,
  });
