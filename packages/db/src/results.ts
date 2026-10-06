import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { TenantTransaction } from "./client.js";
import {
  resultBatches,
  resultEvents,
  resultGradingPolicies,
  resultReports,
} from "./schema.js";
import type {
  CalculatedReport,
  GradingPolicyInput,
} from "./results-contracts.js";
import type { ExamActor, ExamScope } from "./examinations.js";
export class ResultsError extends Error {
  constructor(
    readonly code: "INVALID" | "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ResultsError";
  }
}
const scoped = (
  t: { tenantId: AnyPgColumn; schoolId: AnyPgColumn },
  s: ExamScope,
) => and(eq(t.tenantId, s.tenantId), eq(t.schoolId, s.schoolId));
export const resultConflict = (message: string): never => {
  throw new ResultsError("CONFLICT", message);
};
export function resultVersion(actual: number, expected: number) {
  if (actual !== expected)
    resultConflict(
      "These results changed in another session. Refresh before continuing",
    );
}
export async function resultEvent(
  tx: TenantTransaction,
  s: ExamScope,
  batchId: string | null,
  policyId: string | null,
  eventType: string,
  details: Record<string, unknown>,
  actor: ExamActor,
) {
  await tx
    .insert(resultEvents)
    .values({
      ...s,
      batchId,
      policyId,
      eventType,
      details,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      requestId: actor.requestId,
    });
}
export function listResultPolicies(tx: TenantTransaction, s: ExamScope) {
  return tx
    .select()
    .from(resultGradingPolicies)
    .where(scoped(resultGradingPolicies, s))
    .orderBy(
      asc(resultGradingPolicies.name),
      desc(resultGradingPolicies.revision),
    );
}
export async function getResultPolicy(
  tx: TenantTransaction,
  s: ExamScope,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(resultGradingPolicies)
    .where(
      and(scoped(resultGradingPolicies, s), eq(resultGradingPolicies.id, id)),
    );
  if (!row)
    throw new ResultsError(
      "NOT_FOUND",
      "Grading policy was not found at this school",
    );
  return row;
}
export async function createResultPolicy(
  tx: TenantTransaction,
  s: ExamScope,
  input: GradingPolicyInput,
  actor: ExamActor,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${s.tenantId + ":" + s.schoolId + ":results-policy:" + input.name.toLowerCase()},0))`,
  );
  const existing = (await listResultPolicies(tx, s)).find(
    (p) => p.idempotencyKey === input.idempotencyKey,
  );
  if (existing) {
    if (
      existing.actorAccountId !== actor.accountId ||
      existing.name !== input.name ||
      JSON.stringify(existing.bands) !== JSON.stringify(input.bands) ||
      existing.overallPassingPercentage !== input.overallPassingPercentage ||
      existing.requireSubjectPass !== input.requireSubjectPass
    )
      resultConflict(
        "This request key was already used for another grading policy",
      );
    return existing;
  }
  const previous = (await listResultPolicies(tx, s)).filter(
    (p) => p.name.toLowerCase() === input.name.toLowerCase(),
  );
  const [row] = await tx
    .insert(resultGradingPolicies)
    .values({
      ...s,
      ...input,
      revision: Math.max(0, ...previous.map((p) => p.revision)) + 1,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
    })
    .returning();
  await resultEvent(
    tx,
    s,
    null,
    row.id,
    "grading_policy_created",
    { revision: row.revision },
    actor,
  );
  return row;
}
export function listResultBatches(tx: TenantTransaction, s: ExamScope) {
  return tx
    .select()
    .from(resultBatches)
    .where(scoped(resultBatches, s))
    .orderBy(desc(resultBatches.createdAt), desc(resultBatches.edition));
}
export async function getResultBatch(
  tx: TenantTransaction,
  s: ExamScope,
  id: string,
  lock: "update" | "share" | false = false,
) {
  const query = tx
    .select()
    .from(resultBatches)
    .where(and(scoped(resultBatches, s), eq(resultBatches.id, id)));
  const [row] = await (lock ? query.for(lock) : query);
  if (!row) throw new ResultsError("NOT_FOUND", "Result edition was not found");
  return row;
}
export function listBatchReports(
  tx: TenantTransaction,
  s: ExamScope,
  batchId: string,
) {
  return tx
    .select()
    .from(resultReports)
    .where(and(scoped(resultReports, s), eq(resultReports.batchId, batchId)))
    .orderBy(asc(resultReports.sectionId), asc(resultReports.studentId));
}
export function listResultHistory(
  tx: TenantTransaction,
  s: ExamScope,
  batchId: string,
) {
  return tx
    .select()
    .from(resultEvents)
    .where(and(scoped(resultEvents, s), eq(resultEvents.batchId, batchId)))
    .orderBy(asc(resultEvents.createdAt), asc(resultEvents.id));
}
export async function createResultBatch(
  tx: TenantTransaction,
  s: ExamScope,
  input: {
    examId: string;
    sessionId: string;
    classId: string;
    gradingPolicyId: string;
    sourceFingerprint: string;
    idempotencyKey: string;
    requestChecksum: string;
  },
  reports: CalculatedReport[],
  actor: ExamActor,
) {
  const all = await listResultBatches(tx, s),
    existing = all.find((b) => b.idempotencyKey === input.idempotencyKey);
  if (existing) {
    if (existing.requestChecksum !== input.requestChecksum)
      resultConflict(
        "This request key was already used for another result edition",
      );
    return existing;
  }
  if (!reports.length)
    throw new ResultsError(
      "INVALID",
      "The completed examination has no students to calculate",
    );
  const [row] = await tx
    .insert(resultBatches)
    .values({
      ...s,
      ...input,
      edition:
        Math.max(
          0,
          ...all.filter((b) => b.examId === input.examId).map((b) => b.edition),
        ) + 1,
      preparedByAccountId: actor.accountId,
      preparedByMembershipId: actor.membershipId,
    })
    .returning();
  await tx
    .insert(resultReports)
    .values(
      reports.map((r) => ({
        ...s,
        ...r,
        batchId: row.id,
        sessionId: row.sessionId,
        classId: row.classId,
      })),
    );
  await resultEvent(
    tx,
    s,
    row.id,
    null,
    "results_calculated",
    {
      edition: row.edition,
      reportCount: reports.length,
      sourceFingerprint: input.sourceFingerprint,
    },
    actor,
  );
  return row;
}
export async function updateResultBatch(
  tx: TenantTransaction,
  s: ExamScope,
  id: string,
  values: Partial<typeof resultBatches.$inferInsert>,
) {
  const [row] = await tx
    .update(resultBatches)
    .set(values)
    .where(and(scoped(resultBatches, s), eq(resultBatches.id, id)))
    .returning();
  return row;
}
export async function recalculateResultReports(
  tx: TenantTransaction,
  s: ExamScope,
  batchId: string,
  reports: CalculatedReport[],
) {
  const old = await listBatchReports(tx, s, batchId);
  if (
    old.length !== reports.length ||
    old.some(
      (r) =>
        !reports.some(
          (n) => n.studentId === r.studentId && n.sectionId === r.sectionId,
        ),
    )
  )
    resultConflict(
      "The examination roster no longer matches this result edition",
    );
  for (const r of reports)
    await tx
      .update(resultReports)
      .set({ snapshot: r.snapshot })
      .where(
        and(
          scoped(resultReports, s),
          eq(resultReports.batchId, batchId),
          eq(resultReports.studentId, r.studentId),
          eq(resultReports.sectionId, r.sectionId),
        ),
      );
}
export async function findResultReport(
  tx: TenantTransaction,
  tenantId: string,
  id: string,
) {
  const [row] = await tx
    .select()
    .from(resultReports)
    .where(and(eq(resultReports.tenantId, tenantId), eq(resultReports.id, id)));
  if (!row) throw new ResultsError("NOT_FOUND", "Report card was not found");
  return row;
}
export async function saveResultRemarks(
  tx: TenantTransaction,
  s: ExamScope,
  id: string,
  remarks: string | null,
) {
  await tx
    .update(resultReports)
    .set({ remarks })
    .where(and(scoped(resultReports, s), eq(resultReports.id, id)));
}
export function listPersonalReports(
  tx: TenantTransaction,
  tenantId: string,
  studentIds: string[],
) {
  if (!studentIds.length) return Promise.resolve([]);
  return tx
    .select({ report: resultReports, batch: resultBatches })
    .from(resultReports)
    .innerJoin(
      resultBatches,
      and(
        eq(resultBatches.tenantId, resultReports.tenantId),
        eq(resultBatches.schoolId, resultReports.schoolId),
        eq(resultBatches.id, resultReports.batchId),
      ),
    )
    .where(
      and(
        eq(resultReports.tenantId, tenantId),
        inArray(resultReports.studentId, studentIds),
        eq(resultBatches.status, "published"),
      ),
    )
    .orderBy(desc(resultBatches.publishedAt));
}
