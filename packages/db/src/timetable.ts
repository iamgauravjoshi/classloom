import { and, eq } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { academicTeacherAssignments, weeklyTimetableEvents, weeklyTimetableSlots, weeklyTimetables } from './schema.js';

export type TimetableScope = { tenantId: string; schoolId: string };
export type TimetableActor = { accountId: string; membershipId: string; requestId?: string };
export type TimetableSlotInput = {
  sessionId: string;
  sectionId: string;
  subjectId: string;
  teacherAssignmentId?: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  roomLabel?: string | null;
};
export type TimetableFilters = { sectionId?: string; teacherMembershipId?: string };

export class TimetableError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'TimetableError';
  }
}

function localTime(value: string, label: string): string {
  const trimmed = value.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) throw new TimetableError('INVALID', `${label} must be a valid local time in HH:mm format`);
  return trimmed;
}

export function normalizeTimetableSlotInput(input: TimetableSlotInput) {
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) {
    throw new TimetableError('INVALID', 'Choose a weekday from Monday through Sunday');
  }
  const startTime = localTime(input.startTime, 'Start time');
  const endTime = localTime(input.endTime, 'End time');
  if (endTime <= startTime) throw new TimetableError('INVALID', 'The end time must be after the start time');
  const roomLabel = input.roomLabel?.trim() || null;
  if (roomLabel && roomLabel.length > 120) throw new TimetableError('INVALID', 'Room must be at most 120 characters');
  return {
    sessionId: input.sessionId,
    sectionId: input.sectionId,
    subjectId: input.subjectId,
    teacherAssignmentId: input.teacherAssignmentId || null,
    weekday: input.weekday,
    startTime,
    endTime,
    roomLabel,
  };
}

function databaseCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value.code ?? value.cause?.code;
}

function mapDatabaseError(error: unknown): never {
  if (databaseCode(error) === '23505') throw new TimetableError('CONFLICT', 'This timetable change conflicts with an existing record');
  if (databaseCode(error) === '23503') throw new TimetableError('NOT_FOUND', 'A related academic record was not found in this school');
  throw error;
}

async function appendEvent(
  tx: TenantTransaction,
  scope: TimetableScope,
  timetableId: string,
  actor: TimetableActor,
  eventType: 'created' | 'slot_created' | 'slot_updated' | 'slot_deleted' | 'published',
  slotId?: string | null,
) {
  await tx.insert(weeklyTimetableEvents).values({
    ...scope, timetableId, slotId: slotId ?? null,
    actorAccountId: actor.accountId, actorMembershipId: actor.membershipId, eventType,
  });
}

export async function readWeeklyTimetable(tx: TenantTransaction, scope: TimetableScope, sessionId: string, filters: TimetableFilters = {}) {
  const [timetable] = await tx.select().from(weeklyTimetables).where(and(
    eq(weeklyTimetables.tenantId, scope.tenantId),
    eq(weeklyTimetables.schoolId, scope.schoolId),
    eq(weeklyTimetables.sessionId, sessionId),
  )).limit(1);
  if (!timetable) return { timetable: null, slots: [] };
  const conditions = [
    eq(weeklyTimetableSlots.tenantId, scope.tenantId),
    eq(weeklyTimetableSlots.schoolId, scope.schoolId),
    eq(weeklyTimetableSlots.timetableId, timetable.id),
  ];
  if (filters.sectionId) conditions.push(eq(weeklyTimetableSlots.sectionId, filters.sectionId));
  if (filters.teacherMembershipId) conditions.push(eq(academicTeacherAssignments.membershipId, filters.teacherMembershipId));
  const slots = await tx.select({
    slot: weeklyTimetableSlots,
    teacherMembershipId: academicTeacherAssignments.membershipId,
  }).from(weeklyTimetableSlots)
    .leftJoin(academicTeacherAssignments, and(
      eq(academicTeacherAssignments.tenantId, weeklyTimetableSlots.tenantId),
      eq(academicTeacherAssignments.schoolId, weeklyTimetableSlots.schoolId),
      eq(academicTeacherAssignments.sessionId, weeklyTimetableSlots.sessionId),
      eq(academicTeacherAssignments.id, weeklyTimetableSlots.teacherAssignmentId),
    ))
    .where(and(...conditions))
    .orderBy(weeklyTimetableSlots.weekday, weeklyTimetableSlots.startTime, weeklyTimetableSlots.id);
  return { timetable, slots: slots.map(({ slot, teacherMembershipId }) => ({ ...slot, teacherMembershipId })) };
}

export async function lockOrCreateWeeklyTimetable(tx: TenantTransaction, scope: TimetableScope, sessionId: string, actor: TimetableActor) {
  const [created] = await tx.insert(weeklyTimetables).values({
    ...scope, sessionId,
    createdByAccountId: actor.accountId, createdByMembershipId: actor.membershipId,
    updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId,
  }).onConflictDoNothing({ target: [weeklyTimetables.tenantId, weeklyTimetables.schoolId, weeklyTimetables.sessionId] }).returning();
  if (created) await appendEvent(tx, scope, created.id, actor, 'created');
  const [timetable] = await tx.select().from(weeklyTimetables).where(and(
    eq(weeklyTimetables.tenantId, scope.tenantId),
    eq(weeklyTimetables.schoolId, scope.schoolId),
    eq(weeklyTimetables.sessionId, sessionId),
  )).for('update').limit(1);
  if (!timetable) throw new TimetableError('NOT_FOUND', 'Academic session was not found in this school');
  return timetable;
}

export async function lockWeeklyTimetableForSlot(tx: TenantTransaction, scope: TimetableScope, slotId: string) {
  const [initial] = await tx.select().from(weeklyTimetableSlots).where(and(
    eq(weeklyTimetableSlots.tenantId, scope.tenantId), eq(weeklyTimetableSlots.schoolId, scope.schoolId), eq(weeklyTimetableSlots.id, slotId),
  )).limit(1);
  if (!initial) throw new TimetableError('NOT_FOUND', 'Timetable slot was not found');
  const [timetable] = await tx.select().from(weeklyTimetables).where(and(
    eq(weeklyTimetables.tenantId, scope.tenantId), eq(weeklyTimetables.schoolId, scope.schoolId), eq(weeklyTimetables.id, initial.timetableId),
  )).for('update').limit(1);
  if (!timetable) throw new TimetableError('NOT_FOUND', 'Timetable slot was not found');
  const [slot] = await tx.select().from(weeklyTimetableSlots).where(and(
    eq(weeklyTimetableSlots.tenantId, scope.tenantId), eq(weeklyTimetableSlots.schoolId, scope.schoolId),
    eq(weeklyTimetableSlots.timetableId, timetable.id), eq(weeklyTimetableSlots.id, slotId),
  )).limit(1);
  if (!slot) throw new TimetableError('NOT_FOUND', 'Timetable slot was not found');
  return { timetable, slot };
}

async function resetToDraft(tx: TenantTransaction, scope: TimetableScope, timetableId: string, actor: TimetableActor) {
  await tx.update(weeklyTimetables).set({
    status: 'draft', publishedAt: null, updatedAt: new Date(),
    updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId,
  }).where(and(
    eq(weeklyTimetables.tenantId, scope.tenantId), eq(weeklyTimetables.schoolId, scope.schoolId), eq(weeklyTimetables.id, timetableId),
  ));
}

export async function insertTimetableSlot(tx: TenantTransaction, scope: TimetableScope, timetableId: string, input: TimetableSlotInput, actor: TimetableActor) {
  const normalized = normalizeTimetableSlotInput(input);
  try {
    const [slot] = await tx.insert(weeklyTimetableSlots).values({
      ...scope, timetableId, ...normalized,
      createdByAccountId: actor.accountId, createdByMembershipId: actor.membershipId,
      updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId,
    }).returning();
    if (!slot) throw new Error('Timetable slot insert did not return a row');
    await resetToDraft(tx, scope, timetableId, actor);
    await appendEvent(tx, scope, timetableId, actor, 'slot_created', slot.id);
    return slot;
  } catch (error) { return mapDatabaseError(error); }
}

export async function updateTimetableSlot(tx: TenantTransaction, scope: TimetableScope, slotId: string, input: TimetableSlotInput, actor: TimetableActor) {
  const normalized = normalizeTimetableSlotInput(input);
  const { timetable } = await lockWeeklyTimetableForSlot(tx, scope, slotId);
  try {
    const [slot] = await tx.update(weeklyTimetableSlots).set({
      ...normalized,
      updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId, updatedAt: new Date(),
    }).where(and(
      eq(weeklyTimetableSlots.tenantId, scope.tenantId), eq(weeklyTimetableSlots.schoolId, scope.schoolId), eq(weeklyTimetableSlots.id, slotId),
    )).returning();
    if (!slot) throw new TimetableError('NOT_FOUND', 'Timetable slot was not found');
    await resetToDraft(tx, scope, timetable.id, actor);
    await appendEvent(tx, scope, timetable.id, actor, 'slot_updated', slot.id);
    return slot;
  } catch (error) { return mapDatabaseError(error); }
}

export async function deleteTimetableSlot(tx: TenantTransaction, scope: TimetableScope, slotId: string, actor: TimetableActor) {
  const { timetable } = await lockWeeklyTimetableForSlot(tx, scope, slotId);
  const [deleted] = await tx.delete(weeklyTimetableSlots).where(and(
    eq(weeklyTimetableSlots.tenantId, scope.tenantId), eq(weeklyTimetableSlots.schoolId, scope.schoolId), eq(weeklyTimetableSlots.id, slotId),
  )).returning({ id: weeklyTimetableSlots.id });
  if (!deleted) throw new TimetableError('NOT_FOUND', 'Timetable slot was not found');
  await resetToDraft(tx, scope, timetable.id, actor);
  await appendEvent(tx, scope, timetable.id, actor, 'slot_deleted', slotId);
}

export async function publishWeeklyTimetable(tx: TenantTransaction, scope: TimetableScope, timetableId: string, actor: TimetableActor) {
  const [timetable] = await tx.select().from(weeklyTimetables).where(and(
    eq(weeklyTimetables.tenantId, scope.tenantId), eq(weeklyTimetables.schoolId, scope.schoolId), eq(weeklyTimetables.id, timetableId),
  )).for('update').limit(1);
  if (!timetable) throw new TimetableError('NOT_FOUND', 'Timetable was not found');
  const [published] = await tx.update(weeklyTimetables).set({
    status: 'published', publishedAt: new Date(), updatedAt: new Date(),
    updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId,
  }).where(and(
    eq(weeklyTimetables.tenantId, scope.tenantId), eq(weeklyTimetables.schoolId, scope.schoolId), eq(weeklyTimetables.id, timetableId),
  )).returning();
  if (!published) throw new TimetableError('NOT_FOUND', 'Timetable was not found');
  await appendEvent(tx, scope, timetableId, actor, 'published');
  return published;
}
