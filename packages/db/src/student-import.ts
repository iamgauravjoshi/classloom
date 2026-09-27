import { and, eq } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { studentImportBatches } from './schema.js';

export type StudentImportScope = { tenantId: string; schoolId: string };
export type StudentImportCounts = { studentCount: number; guardianCount: number; enrollmentCount: number };

export class StudentImportBatchError extends Error {
  constructor(readonly code: 'CONFLICT' | 'INVALID' | 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'StudentImportBatchError';
  }
}

export async function beginStudentImportBatch(
  tx: TenantTransaction,
  scope: StudentImportScope,
  actorAccountId: string,
  idempotencyKey: string,
  payloadChecksum: string,
) {
  const key = idempotencyKey.trim();
  if (!key || key.length > 200) throw new StudentImportBatchError('INVALID', 'Idempotency key must be 1–200 characters');
  if (!/^[a-f0-9]{64}$/i.test(payloadChecksum)) throw new StudentImportBatchError('INVALID', 'Payload checksum is invalid');
  const [created] = await tx.insert(studentImportBatches).values({
    ...scope, actorAccountId, idempotencyKey: key, payloadChecksum: payloadChecksum.toLowerCase(),
  }).onConflictDoNothing({
    target: [studentImportBatches.tenantId, studentImportBatches.schoolId, studentImportBatches.idempotencyKey],
  }).returning();
  if (created) return { batch: created, replayed: false as const };
  const [existing] = await tx.select().from(studentImportBatches).where(and(
    eq(studentImportBatches.tenantId, scope.tenantId), eq(studentImportBatches.schoolId, scope.schoolId),
    eq(studentImportBatches.idempotencyKey, key),
  )).for('update').limit(1);
  if (!existing) throw new StudentImportBatchError('NOT_FOUND', 'Import batch was not found after idempotency conflict');
  if (existing.payloadChecksum !== payloadChecksum.toLowerCase()) {
    throw new StudentImportBatchError('CONFLICT', 'This idempotency key was already used with a different file or mapping');
  }
  if (existing.status !== 'completed') {
    throw new StudentImportBatchError('CONFLICT', 'This import is already being processed');
  }
  return { batch: existing, replayed: true as const };
}

export async function completeStudentImportBatch(
  tx: TenantTransaction,
  scope: StudentImportScope,
  batchId: string,
  counts: StudentImportCounts,
) {
  const [completed] = await tx.update(studentImportBatches).set({
    status: 'completed', ...counts, completedAt: new Date(), updatedAt: new Date(), failureCategory: null,
  }).where(and(
    eq(studentImportBatches.tenantId, scope.tenantId), eq(studentImportBatches.schoolId, scope.schoolId),
    eq(studentImportBatches.id, batchId), eq(studentImportBatches.status, 'processing'),
  )).returning();
  if (!completed) throw new StudentImportBatchError('CONFLICT', 'Import batch is no longer processing');
  return completed;
}
