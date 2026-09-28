import { and, asc, eq, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { dailyAttendanceEntries, dailyAttendanceEvents, dailyAttendanceRegisters } from './schema.js';

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type AttendanceScope = { tenantId: string; schoolId: string };
export type AttendanceActor = { accountId: string; membershipId: string; requestId: string };
export type AttendanceRosterStudent = {
  academicEnrollmentId: string;
  studentId: string;
  rollNumber: string | null;
  displayName: string;
};
export type AttendanceEntryInput = { academicEnrollmentId: string; status: AttendanceStatus };
export type AttendanceRegisterInput = {
  sessionId: string;
  sectionId: string;
  date: string;
  entries: AttendanceEntryInput[];
};
export type AttendanceCompletion = {
  total: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  unmarked: number;
  complete: boolean;
};

export class AttendanceError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'AttendanceError';
  }
}

const statuses = new Set<AttendanceStatus>(['present', 'absent', 'late', 'excused']);

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeAttendanceRegisterInput(
  input: AttendanceRegisterInput,
  roster: readonly AttendanceRosterStudent[],
): AttendanceRegisterInput {
  if (!validDate(input.date)) throw new AttendanceError('INVALID', 'Attendance date must be a valid calendar date');
  if (!roster.length) throw new AttendanceError('INVALID', 'There are no enrolled students to mark for this section and date');

  const rosterIds = roster.map((student) => student.academicEnrollmentId);
  if (new Set(rosterIds).size !== rosterIds.length) {
    throw new AttendanceError('CONFLICT', 'The student roster changed. Refresh the register and try again');
  }
  const byEnrollment = new Map<string, AttendanceStatus>();
  for (const entry of input.entries) {
    if (byEnrollment.has(entry.academicEnrollmentId)) {
      throw new AttendanceError('INVALID', 'An enrollment may appear only once in an attendance register');
    }
    if (!rosterIds.includes(entry.academicEnrollmentId)) {
      throw new AttendanceError('CONFLICT', 'The student roster changed. Refresh the register and try again');
    }
    if (!statuses.has(entry.status)) {
      throw new AttendanceError('INVALID', 'Choose present, absent, late, or excused for every student');
    }
    byEnrollment.set(entry.academicEnrollmentId, entry.status);
  }
  if (byEnrollment.size !== rosterIds.length) {
    throw new AttendanceError('INVALID', 'Set an attendance status for every enrolled student');
  }
  return {
    sessionId: input.sessionId,
    sectionId: input.sectionId,
    date: input.date,
    entries: roster.map((student) => ({
      academicEnrollmentId: student.academicEnrollmentId,
      status: byEnrollment.get(student.academicEnrollmentId)!,
    })),
  };
}

export function calculateAttendanceCompletion(entries: readonly { status: AttendanceStatus | null }[]): AttendanceCompletion {
  const counts = { total: entries.length, present: 0, absent: 0, late: 0, excused: 0, unmarked: 0, complete: false };
  for (const { status } of entries) {
    if (status === null) counts.unmarked += 1;
    else counts[status] += 1;
  }
  counts.complete = counts.total > 0 && counts.unmarked === 0;
  return counts;
}

export function changedAttendanceEntries(
  previous: readonly AttendanceEntryInput[],
  next: readonly AttendanceEntryInput[],
): { academicEnrollmentId: string; previousStatus: AttendanceStatus | null; status: AttendanceStatus }[] {
  const previousByEnrollment = new Map(previous.map((entry) => [entry.academicEnrollmentId, entry.status]));
  return next.flatMap((entry) => {
    const previousStatus = previousByEnrollment.get(entry.academicEnrollmentId) ?? null;
    return previousStatus === entry.status ? [] : [{ academicEnrollmentId: entry.academicEnrollmentId, previousStatus, status: entry.status }];
  });
}

export async function readDailyAttendance(
  tx: TenantTransaction,
  scope: AttendanceScope,
  key: { sessionId: string; sectionId: string; date: string },
  roster: readonly AttendanceRosterStudent[],
) {
  const [register] = await tx.select().from(dailyAttendanceRegisters).where(and(
    eq(dailyAttendanceRegisters.tenantId, scope.tenantId), eq(dailyAttendanceRegisters.schoolId, scope.schoolId),
    eq(dailyAttendanceRegisters.sessionId, key.sessionId), eq(dailyAttendanceRegisters.sectionId, key.sectionId),
    eq(dailyAttendanceRegisters.attendanceDate, key.date),
  )).limit(1);
  if (!register) {
    const entries = roster.map((student) => ({ ...student, status: null as AttendanceStatus | null }));
    return { register: null, entries, completion: calculateAttendanceCompletion(entries) };
  }
  const saved = await tx.select({ academicEnrollmentId: dailyAttendanceEntries.academicEnrollmentId, status: dailyAttendanceEntries.status })
    .from(dailyAttendanceEntries).where(and(
      eq(dailyAttendanceEntries.tenantId, scope.tenantId), eq(dailyAttendanceEntries.schoolId, scope.schoolId),
      eq(dailyAttendanceEntries.registerId, register.id),
    ));
  const statusByEnrollment = new Map(saved.map((entry) => [entry.academicEnrollmentId, entry.status as AttendanceStatus]));
  const entries = roster.map((student) => ({
    ...student,
    status: statusByEnrollment.get(student.academicEnrollmentId) ?? null,
  }));
  return { register, entries, completion: calculateAttendanceCompletion(entries) };
}

export async function getDailyAttendanceRegister(tx: TenantTransaction, scope: AttendanceScope, registerId: string) {
  const [register] = await tx.select().from(dailyAttendanceRegisters).where(and(
    eq(dailyAttendanceRegisters.tenantId, scope.tenantId), eq(dailyAttendanceRegisters.schoolId, scope.schoolId),
    eq(dailyAttendanceRegisters.id, registerId),
  )).limit(1);
  return register ?? null;
}

async function lockOrCreateRegister(
  tx: TenantTransaction,
  scope: AttendanceScope,
  input: AttendanceRegisterInput,
  actor: AttendanceActor,
) {
  await tx.insert(dailyAttendanceRegisters).values({
    ...scope,
    sessionId: input.sessionId,
    sectionId: input.sectionId,
    attendanceDate: input.date,
    createdByAccountId: actor.accountId,
    createdByMembershipId: actor.membershipId,
    updatedByAccountId: actor.accountId,
    updatedByMembershipId: actor.membershipId,
  }).onConflictDoNothing();
  const [register] = await tx.select().from(dailyAttendanceRegisters).where(and(
    eq(dailyAttendanceRegisters.tenantId, scope.tenantId), eq(dailyAttendanceRegisters.schoolId, scope.schoolId),
    eq(dailyAttendanceRegisters.sessionId, input.sessionId), eq(dailyAttendanceRegisters.sectionId, input.sectionId),
    eq(dailyAttendanceRegisters.attendanceDate, input.date),
  )).for('update').limit(1);
  if (!register) throw new AttendanceError('CONFLICT', 'The attendance register changed. Refresh the page and try again');
  return register;
}

export async function saveDailyAttendance(
  tx: TenantTransaction,
  scope: AttendanceScope,
  rawInput: AttendanceRegisterInput,
  roster: readonly AttendanceRosterStudent[],
  actor: AttendanceActor,
) {
  if (!actor.requestId.trim()) throw new AttendanceError('INVALID', 'Attendance changes require a request ID');
  const input = normalizeAttendanceRegisterInput(rawInput, roster);
  const register = await lockOrCreateRegister(tx, scope, input, actor);
  const currentRows = await tx.select({ academicEnrollmentId: dailyAttendanceEntries.academicEnrollmentId, status: dailyAttendanceEntries.status })
    .from(dailyAttendanceEntries).where(and(
      eq(dailyAttendanceEntries.tenantId, scope.tenantId), eq(dailyAttendanceEntries.schoolId, scope.schoolId),
      eq(dailyAttendanceEntries.registerId, register.id),
    ));
  const current = currentRows.map((entry) => ({ ...entry, status: entry.status as AttendanceStatus }));
  const changes = changedAttendanceEntries(current, input.entries);

  await tx.update(dailyAttendanceRegisters).set({
    updatedByAccountId: actor.accountId,
    updatedByMembershipId: actor.membershipId,
    updatedAt: new Date(),
  }).where(and(
    eq(dailyAttendanceRegisters.tenantId, scope.tenantId), eq(dailyAttendanceRegisters.schoolId, scope.schoolId),
    eq(dailyAttendanceRegisters.id, register.id),
  ));

  await tx.insert(dailyAttendanceEntries).values(input.entries.map((entry) => ({
    ...scope, registerId: register.id, academicEnrollmentId: entry.academicEnrollmentId, status: entry.status,
  }))).onConflictDoUpdate({
    target: [dailyAttendanceEntries.tenantId, dailyAttendanceEntries.schoolId, dailyAttendanceEntries.registerId, dailyAttendanceEntries.academicEnrollmentId],
    set: { status: sql.raw('excluded.status'), updatedAt: new Date() },
  });

  if (changes.length) {
    await tx.insert(dailyAttendanceEvents).values(changes.map((change) => ({
      ...scope,
      registerId: register.id,
      academicEnrollmentId: change.academicEnrollmentId,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      requestId: actor.requestId,
      previousStatus: change.previousStatus,
      status: change.status,
    })));
  }
  return readDailyAttendance(tx, scope, input, roster);
}

export async function listDailyAttendanceEvents(tx: TenantTransaction, scope: AttendanceScope, registerId: string) {
  return tx.select().from(dailyAttendanceEvents).where(and(
    eq(dailyAttendanceEvents.tenantId, scope.tenantId), eq(dailyAttendanceEvents.schoolId, scope.schoolId),
    eq(dailyAttendanceEvents.registerId, registerId),
  )).orderBy(asc(dailyAttendanceEvents.createdAt), asc(dailyAttendanceEvents.id));
}
