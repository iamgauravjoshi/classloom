import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { EnrollmentPlacementInput } from './academics.js';
import type { TenantTransaction } from './client.js';
import { lockActiveStudentGuardiansForScope, lockStudentForScope } from './students.js';
import {
  academicSessions,
  guardianProfiles,
  securityEvents,
  studentAcademicEnrollments,
  studentGuardianRelationships,
  studentProfiles,
  studentSchoolEnrollments,
} from './schema.js';

export type EnrollmentScope = { tenantId: string; schoolId: string };

/** Finance contract: lock one school account before changing its receivables. */
export async function lockFinanceEnrollment(tx: TenantTransaction, scope: EnrollmentScope, schoolEnrollmentId: string) {
  const [enrollment] = await tx.select().from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    eq(studentSchoolEnrollments.id, schoolEnrollmentId),
  )).for('update').limit(1);
  if (!enrollment) throw new EnrollmentError('NOT_FOUND', 'Student school enrollment was not found');
  return enrollment;
}

export async function listFinanceEnrollments(tx: TenantTransaction, scope: EnrollmentScope) {
  return tx.select({ id: studentSchoolEnrollments.id, studentId: studentSchoolEnrollments.studentId,
    admissionNumber: studentSchoolEnrollments.admissionNumber, status: studentSchoolEnrollments.status,
    givenName: studentProfiles.givenName, familyName: studentProfiles.familyName })
    .from(studentSchoolEnrollments).innerJoin(studentProfiles, and(
      eq(studentProfiles.tenantId, studentSchoolEnrollments.tenantId), eq(studentProfiles.id, studentSchoolEnrollments.studentId),
    )).where(and(eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId)))
    .orderBy(asc(studentProfiles.familyName), asc(studentProfiles.givenName));
}

export async function hasFinancePlacement(tx: TenantTransaction, scope: EnrollmentScope, schoolEnrollmentId: string, sessionId: string, classId: string) {
  const [placement] = await tx.select({ id: studentAcademicEnrollments.id }).from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.schoolEnrollmentId, schoolEnrollmentId), eq(studentAcademicEnrollments.sessionId, sessionId),
    eq(studentAcademicEnrollments.classId, classId), eq(studentAcademicEnrollments.status, 'active'),
  )).limit(1);
  return Boolean(placement);
}
export type EnrollmentAudit = { actorAccountId: string; requestId?: string };
export type SchoolEnrollmentInput = { admissionNumber: string; admissionDate: string };
export type AcademicEnrollmentInput = { rollNumber?: string | null; startDate: string };
export type EnrollmentCloseInput = { effectiveDate: string; reason?: string | null };
export type EnrollmentPlacement = EnrollmentPlacementInput & {
  sessionName: string;
  sessionStartDate: string;
  sessionEndDate: string;
  sessionStatus: string;
  className: string;
  sectionName: string;
};

export class EnrollmentError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'EnrollmentError';
  }
}

function dbCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value.code ?? value.cause?.code;
}

function dateOnly(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new EnrollmentError('INVALID', `${label} must be a valid calendar date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new EnrollmentError('INVALID', `${label} must be a valid calendar date`);
  }
  return value;
}

function normalizedIdentifier(value: string, label: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9/_-]{0,39}$/.test(normalized)) {
    throw new EnrollmentError('INVALID', `${label} must be 1–40 letters, numbers, slashes, hyphens, or underscores`);
  }
  return normalized;
}

function optionalReason(value: string | null | undefined) {
  const reason = value?.trim() || null;
  if (reason && reason.length > 500) throw new EnrollmentError('INVALID', 'Reason must be at most 500 characters');
  return reason;
}

export function normalizeSchoolEnrollmentInput(input: SchoolEnrollmentInput) {
  return {
    admissionNumber: normalizedIdentifier(input.admissionNumber, 'Admission number'),
    admissionDate: dateOnly(input.admissionDate, 'Admission date'),
  };
}

export function normalizeAcademicEnrollmentInput(input: AcademicEnrollmentInput, earliestDate?: string) {
  const startDate = dateOnly(input.startDate, 'Placement date');
  if (earliestDate && startDate < earliestDate) {
    throw new EnrollmentError('INVALID', 'Placement date cannot be before the current placement start date');
  }
  return {
    rollNumber: input.rollNumber ? normalizedIdentifier(input.rollNumber, 'Roll number') : null,
    startDate,
  };
}

export function requireActiveEnrollment(status: string, action: 'transfer' | 'withdraw' | 'complete') {
  if (status !== 'active') {
    throw new EnrollmentError('CONFLICT', `Only an active academic enrollment can be ${action === 'complete' ? 'completed' : `${action}red`}`);
  }
}

async function audit(tx: TenantTransaction, scope: EnrollmentScope, eventType: string, context: EnrollmentAudit, metadata: Record<string, string>) {
  await tx.insert(securityEvents).values({
    eventType, tenantId: scope.tenantId, accountId: context.actorAccountId, requestId: context.requestId,
    metadata: { schoolId: scope.schoolId, ...metadata },
  });
}

export async function createSchoolEnrollment(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  studentId: string,
  input: SchoolEnrollmentInput,
  auditContext: EnrollmentAudit,
) {
  const values = normalizeSchoolEnrollmentInput(input);
  const [student] = await tx.select({ id: studentProfiles.id, status: studentProfiles.status }).from(studentProfiles).where(and(
    eq(studentProfiles.tenantId, scope.tenantId), eq(studentProfiles.id, studentId),
  )).for('update').limit(1);
  if (!student) throw new EnrollmentError('NOT_FOUND', 'Student was not found');
  if (student.status !== 'active') throw new EnrollmentError('CONFLICT', 'Inactive students cannot be enrolled');
  await lockActiveStudentGuardiansForScope(tx, scope.tenantId, studentId);
  const [current] = await tx.select({ id: studentSchoolEnrollments.id }).from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    eq(studentSchoolEnrollments.studentId, studentId), eq(studentSchoolEnrollments.status, 'active'),
  )).limit(1);
  if (current) throw new EnrollmentError('CONFLICT', 'Student already has an active enrollment at this school');
  try {
    const [created] = await tx.insert(studentSchoolEnrollments).values({ ...scope, studentId, ...values }).returning();
    if (!created) throw new Error('School enrollment insert did not return a row');
    await audit(tx, scope, 'student_school_enrollment_created', auditContext, { studentId, schoolEnrollmentId: created.id });
    return created;
  } catch (error) {
    if (dbCode(error) === '23505') throw new EnrollmentError('CONFLICT', 'Admission number is already in use at this school');
    throw error;
  }
}

async function requireActiveSchoolEnrollment(tx: TenantTransaction, scope: EnrollmentScope, schoolEnrollmentId: string, lock = false) {
  const query = tx.select().from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    eq(studentSchoolEnrollments.id, schoolEnrollmentId),
  ));
  const [record] = lock ? await query.for('update').limit(1) : await query.limit(1);
  if (!record) throw new EnrollmentError('NOT_FOUND', 'School enrollment was not found');
  if (record.status !== 'active') throw new EnrollmentError('CONFLICT', 'School enrollment is not active');
  return record;
}

function validatePlacementDate(placement: EnrollmentPlacement, date: string) {
  if (date < placement.sessionStartDate || date > placement.sessionEndDate) {
    throw new EnrollmentError('INVALID', 'Placement date must be within the academic session');
  }
}

export async function createAcademicEnrollment(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  schoolEnrollmentId: string,
  placement: EnrollmentPlacement,
  input: AcademicEnrollmentInput,
  auditContext: EnrollmentAudit,
) {
  const values = normalizeAcademicEnrollmentInput(input);
  validatePlacementDate(placement, values.startDate);
  const schoolEnrollment = await requireActiveSchoolEnrollment(tx, scope, schoolEnrollmentId, true);
  if (schoolEnrollment.admissionDate > values.startDate) {
    throw new EnrollmentError('INVALID', 'Placement date cannot be before the school admission date');
  }
  const [current] = await tx.select({ id: studentAcademicEnrollments.id }).from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.studentId, schoolEnrollment.studentId), eq(studentAcademicEnrollments.sessionId, placement.sessionId),
    eq(studentAcademicEnrollments.status, 'active'),
  )).limit(1);
  if (current) throw new EnrollmentError('CONFLICT', 'Student already has an active placement in this academic session');
  try {
    const [created] = await tx.insert(studentAcademicEnrollments).values({
      ...scope,
      studentId: schoolEnrollment.studentId,
      schoolEnrollmentId,
      sessionId: placement.sessionId,
      classId: placement.classId,
      sectionId: placement.sectionId,
      ...values,
    }).returning();
    if (!created) throw new Error('Academic enrollment insert did not return a row');
    await audit(tx, scope, 'student_academic_enrollment_created', auditContext, {
      studentId: schoolEnrollment.studentId, schoolEnrollmentId, academicEnrollmentId: created.id,
      sessionId: placement.sessionId, classId: placement.classId, sectionId: placement.sectionId,
    });
    return created;
  } catch (error) {
    if (dbCode(error) === '23505') throw new EnrollmentError('CONFLICT', 'Student placement or roll number conflicts with an active enrollment');
    throw error;
  }
}

async function lockAcademicEnrollment(tx: TenantTransaction, scope: EnrollmentScope, enrollmentId: string) {
  const [record] = await tx.select().from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.id, enrollmentId),
  )).for('update').limit(1);
  if (!record) throw new EnrollmentError('NOT_FOUND', 'Academic enrollment was not found');
  return record;
}

async function lockAcademicParent(tx: TenantTransaction, scope: EnrollmentScope, enrollmentId: string) {
  const [academic] = await tx.select({ schoolEnrollmentId: studentAcademicEnrollments.schoolEnrollmentId }).from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.id, enrollmentId),
  )).limit(1);
  if (!academic) throw new EnrollmentError('NOT_FOUND', 'Academic enrollment was not found');
  return requireActiveSchoolEnrollment(tx, scope, academic.schoolEnrollmentId, true);
}

async function lockStudentAndGuardiansForClose(tx: TenantTransaction, scope: EnrollmentScope, enrollmentId: string) {
  const [academic] = await tx.select({ studentId: studentAcademicEnrollments.studentId }).from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.id, enrollmentId),
  )).limit(1);
  if (!academic) throw new EnrollmentError('NOT_FOUND', 'Academic enrollment was not found');
  await lockStudentForScope(tx, scope.tenantId, academic.studentId);
  await lockActiveStudentGuardiansForScope(tx, scope.tenantId, academic.studentId);
}

async function requireWritableSourceSession(tx: TenantTransaction, scope: EnrollmentScope, sessionId: string) {
  const [session] = await tx.select({ status: academicSessions.status }).from(academicSessions).where(and(
    eq(academicSessions.tenantId, scope.tenantId), eq(academicSessions.schoolId, scope.schoolId), eq(academicSessions.id, sessionId),
  )).limit(1);
  if (!session || session.status === 'archived') throw new EnrollmentError('CONFLICT', 'Archived academic session placements cannot be changed');
}

export async function transferAcademicEnrollment(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  enrollmentId: string,
  placement: EnrollmentPlacement,
  input: AcademicEnrollmentInput & { reason?: string | null },
  auditContext: EnrollmentAudit,
) {
  await lockAcademicParent(tx, scope, enrollmentId);
  const current = await lockAcademicEnrollment(tx, scope, enrollmentId);
  requireActiveEnrollment(current.status, 'transfer');
  await requireWritableSourceSession(tx, scope, current.sessionId);
  const values = normalizeAcademicEnrollmentInput(input, current.startDate);
  validatePlacementDate(placement, values.startDate);
  await tx.update(studentAcademicEnrollments).set({
    status: 'transferred', endDate: values.startDate, reason: optionalReason(input.reason), updatedAt: new Date(),
  }).where(and(eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.id, enrollmentId)));
  try {
    const [created] = await tx.insert(studentAcademicEnrollments).values({
      ...scope,
      studentId: current.studentId,
      schoolEnrollmentId: current.schoolEnrollmentId,
      sessionId: placement.sessionId,
      classId: placement.classId,
      sectionId: placement.sectionId,
      ...values,
    }).returning();
    if (!created) throw new Error('Transfer insert did not return a row');
    await audit(tx, scope, 'student_academic_enrollment_transferred', auditContext, {
      studentId: current.studentId, fromAcademicEnrollmentId: current.id, toAcademicEnrollmentId: created.id,
      sessionId: placement.sessionId, classId: placement.classId, sectionId: placement.sectionId,
    });
    return created;
  } catch (error) {
    if (dbCode(error) === '23505') throw new EnrollmentError('CONFLICT', 'Destination placement or roll number conflicts with an active enrollment');
    throw error;
  }
}

async function closeAcademicEnrollment(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  enrollmentId: string,
  input: EnrollmentCloseInput,
  status: 'withdrawn' | 'completed',
  auditContext: EnrollmentAudit,
) {
  await lockStudentAndGuardiansForClose(tx, scope, enrollmentId);
  await lockAcademicParent(tx, scope, enrollmentId);
  const current = await lockAcademicEnrollment(tx, scope, enrollmentId);
  requireActiveEnrollment(current.status, status === 'withdrawn' ? 'withdraw' : 'complete');
  await requireWritableSourceSession(tx, scope, current.sessionId);
  const effectiveDate = dateOnly(input.effectiveDate, 'Effective date');
  const activePlacements = await tx.select().from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.schoolEnrollmentId, current.schoolEnrollmentId), eq(studentAcademicEnrollments.status, 'active'),
  )).orderBy(asc(studentAcademicEnrollments.id)).for('update');
  if (activePlacements.some((placement) => effectiveDate < placement.startDate)) {
    throw new EnrollmentError('INVALID', 'Effective date cannot be before an active placement start date');
  }
  for (const placement of activePlacements) await requireWritableSourceSession(tx, scope, placement.sessionId);
  const reason = optionalReason(input.reason);
  await tx.update(studentAcademicEnrollments).set({ status, endDate: effectiveDate, reason, updatedAt: new Date() }).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.schoolEnrollmentId, current.schoolEnrollmentId), eq(studentAcademicEnrollments.status, 'active'),
  ));
  await tx.update(studentSchoolEnrollments).set({ status, leavingDate: effectiveDate, leavingReason: reason, updatedAt: new Date() }).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    eq(studentSchoolEnrollments.id, current.schoolEnrollmentId), eq(studentSchoolEnrollments.status, 'active'),
  ));
  await audit(tx, scope, `student_academic_enrollment_${status}`, auditContext, {
    studentId: current.studentId, academicEnrollmentId: current.id, schoolEnrollmentId: current.schoolEnrollmentId,
    closedAcademicEnrollmentIds: activePlacements.map((placement) => placement.id).join(','),
  });
  return lockAcademicEnrollment(tx, scope, enrollmentId);
}

export function withdrawAcademicEnrollment(tx: TenantTransaction, scope: EnrollmentScope, enrollmentId: string, input: EnrollmentCloseInput, auditContext: EnrollmentAudit) {
  return closeAcademicEnrollment(tx, scope, enrollmentId, input, 'withdrawn', auditContext);
}

export function completeAcademicEnrollment(tx: TenantTransaction, scope: EnrollmentScope, enrollmentId: string, input: EnrollmentCloseInput, auditContext: EnrollmentAudit) {
  return closeAcademicEnrollment(tx, scope, enrollmentId, input, 'completed', auditContext);
}

export async function listStudentSchoolEnrollments(tx: TenantTransaction, scope: EnrollmentScope, studentId: string) {
  return tx.select().from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    eq(studentSchoolEnrollments.studentId, studentId),
  )).orderBy(asc(studentSchoolEnrollments.admissionDate), asc(studentSchoolEnrollments.id));
}

export async function findActiveSchoolEnrollment(tx: TenantTransaction, scope: EnrollmentScope, studentId: string) {
  const [record] = await tx.select().from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    eq(studentSchoolEnrollments.studentId, studentId), eq(studentSchoolEnrollments.status, 'active'),
  )).limit(1);
  return record ?? null;
}

export async function findActiveAcademicEnrollment(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  studentId: string,
  sessionId: string,
) {
  const [record] = await tx.select().from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.studentId, studentId), eq(studentAcademicEnrollments.sessionId, sessionId),
    eq(studentAcademicEnrollments.status, 'active'),
  )).limit(1);
  return record ?? null;
}

export async function listAcademicEnrollmentHistory(tx: TenantTransaction, scope: EnrollmentScope, schoolEnrollmentId: string) {
  return tx.select().from(studentAcademicEnrollments).where(and(
    eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
    eq(studentAcademicEnrollments.schoolEnrollmentId, schoolEnrollmentId),
  )).orderBy(asc(studentAcademicEnrollments.startDate), asc(studentAcademicEnrollments.id));
}

export async function listAttendanceRoster(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  sessionId: string,
  sectionId: string,
  date: string,
) {
  return tx.select({
    academicEnrollmentId: studentAcademicEnrollments.id,
    studentId: studentAcademicEnrollments.studentId,
    rollNumber: studentAcademicEnrollments.rollNumber,
    displayName: sql<string>`concat_ws(' ', coalesce(${studentProfiles.preferredName}, ${studentProfiles.givenName}), ${studentProfiles.familyName})`,
  }).from(studentAcademicEnrollments)
    .innerJoin(studentProfiles, and(
      eq(studentProfiles.tenantId, studentAcademicEnrollments.tenantId),
      eq(studentProfiles.id, studentAcademicEnrollments.studentId),
    ))
    .where(and(
      eq(studentAcademicEnrollments.tenantId, scope.tenantId),
      eq(studentAcademicEnrollments.schoolId, scope.schoolId),
      eq(studentAcademicEnrollments.sessionId, sessionId),
      eq(studentAcademicEnrollments.sectionId, sectionId),
      lte(studentAcademicEnrollments.startDate, date),
      or(isNull(studentAcademicEnrollments.endDate), gte(studentAcademicEnrollments.endDate, date)),
      eq(studentProfiles.status, 'active'),
    ))
    .orderBy(asc(studentAcademicEnrollments.rollNumber), asc(studentProfiles.familyName), asc(studentProfiles.givenName), asc(studentAcademicEnrollments.id))
    .for('share', { of: studentAcademicEnrollments });
}

export async function listActiveStudentSchoolIds(tx: TenantTransaction, tenantId: string, studentId: string) {
  const rows = await tx.selectDistinct({ schoolId: studentSchoolEnrollments.schoolId }).from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, tenantId), eq(studentSchoolEnrollments.studentId, studentId), eq(studentSchoolEnrollments.status, 'active'),
  ));
  return rows.map((row) => row.schoolId);
}

export async function listActiveGuardianSchoolIds(tx: TenantTransaction, tenantId: string, guardianId: string) {
  const rows = await tx.selectDistinct({ schoolId: studentSchoolEnrollments.schoolId })
    .from(studentGuardianRelationships)
    .innerJoin(studentSchoolEnrollments, and(
      eq(studentSchoolEnrollments.tenantId, studentGuardianRelationships.tenantId),
      eq(studentSchoolEnrollments.studentId, studentGuardianRelationships.studentId),
    ))
    .where(and(
      eq(studentGuardianRelationships.tenantId, tenantId), eq(studentGuardianRelationships.guardianId, guardianId),
      eq(studentGuardianRelationships.status, 'active'), eq(studentSchoolEnrollments.status, 'active'),
    ));
  return rows.map((row) => row.schoolId);
}

export async function listSchoolStudentIds(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  filters: { sessionId?: string; classId?: string; sectionId?: string; status?: string } = {},
) {
  if (filters.sessionId || filters.classId || filters.sectionId) {
    const rows = await tx.selectDistinct({ studentId: studentAcademicEnrollments.studentId }).from(studentAcademicEnrollments).where(and(
      eq(studentAcademicEnrollments.tenantId, scope.tenantId), eq(studentAcademicEnrollments.schoolId, scope.schoolId),
      filters.sessionId ? eq(studentAcademicEnrollments.sessionId, filters.sessionId) : undefined,
      filters.classId ? eq(studentAcademicEnrollments.classId, filters.classId) : undefined,
      filters.sectionId ? eq(studentAcademicEnrollments.sectionId, filters.sectionId) : undefined,
      filters.status ? eq(studentAcademicEnrollments.status, filters.status) : undefined,
    ));
    return rows.map((row) => row.studentId);
  }
  const rows = await tx.selectDistinct({ studentId: studentSchoolEnrollments.studentId }).from(studentSchoolEnrollments).where(and(
    eq(studentSchoolEnrollments.tenantId, scope.tenantId), eq(studentSchoolEnrollments.schoolId, scope.schoolId),
    filters.status ? eq(studentSchoolEnrollments.status, filters.status) : undefined,
  ));
  return rows.map((row) => row.studentId);
}

export async function listSchoolGuardianIds(tx: TenantTransaction, scope: EnrollmentScope) {
  const students = await listSchoolStudentIds(tx, scope);
  if (!students.length) return [];
  const rows = await tx.selectDistinct({ guardianId: studentGuardianRelationships.guardianId }).from(studentGuardianRelationships).where(and(
    eq(studentGuardianRelationships.tenantId, scope.tenantId), inArray(studentGuardianRelationships.studentId, students),
  ));
  return rows.map((row) => row.guardianId);
}

/** Results contract: immutable examination roster references, including historic placements. */
export async function resolveResultEnrollments(
  tx: TenantTransaction,
  scope: EnrollmentScope,
  ids: string[],
) {
  if (!ids.length) return [];
  return tx
    .select({
      academicEnrollmentId: studentAcademicEnrollments.id,
      studentId: studentAcademicEnrollments.studentId,
      schoolEnrollmentId: studentAcademicEnrollments.schoolEnrollmentId,
      admissionNumber: studentSchoolEnrollments.admissionNumber,
    })
    .from(studentAcademicEnrollments)
    .innerJoin(
      studentSchoolEnrollments,
      and(
        eq(
          studentSchoolEnrollments.tenantId,
          studentAcademicEnrollments.tenantId,
        ),
        eq(
          studentSchoolEnrollments.schoolId,
          studentAcademicEnrollments.schoolId,
        ),
        eq(
          studentSchoolEnrollments.id,
          studentAcademicEnrollments.schoolEnrollmentId,
        ),
      ),
    )
    .where(
      and(
        eq(studentAcademicEnrollments.tenantId, scope.tenantId),
        eq(studentAcademicEnrollments.schoolId, scope.schoolId),
        inArray(studentAcademicEnrollments.id, ids),
      ),
    );
}
