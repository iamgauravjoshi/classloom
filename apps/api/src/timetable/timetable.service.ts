import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  TimetableError,
  deleteTimetableSlot,
  insertTimetableSlot,
  lockOrCreateWeeklyTimetable,
  lockWeeklyTimetableForSlot,
  normalizeTimetableSlotInput,
  publishWeeklyTimetable,
  readWeeklyTimetable,
  updateTimetableSlot,
  withTenantContext,
  type TimetableActor as PersistenceActor,
  type TimetableFilters,
  type TimetableScope,
  type TimetableSlotInput,
  type TenantTransaction,
} from '@classloom/db';
import { AcademicsService } from '../academics/academics.service.js';
import { DatabaseService } from '../database/database.service.js';

export type TimetableUserActor = PersistenceActor & { tenantId: string };

export type TimetablePersistence = {
  read: typeof readWeeklyTimetable;
  lockOrCreate: typeof lockOrCreateWeeklyTimetable;
  lockForSlot: typeof lockWeeklyTimetableForSlot;
  insert: typeof insertTimetableSlot;
  update: typeof updateTimetableSlot;
  delete: typeof deleteTimetableSlot;
  publish: typeof publishWeeklyTimetable;
};

export const TIMETABLE_PERSISTENCE = Symbol('TIMETABLE_PERSISTENCE');

const defaultPersistence: TimetablePersistence = {
  read: readWeeklyTimetable,
  lockOrCreate: lockOrCreateWeeklyTimetable,
  lockForSlot: lockWeeklyTimetableForSlot,
  insert: insertTimetableSlot,
  update: updateTimetableSlot,
  delete: deleteTimetableSlot,
  publish: publishWeeklyTimetable,
};

type SlotRecord = Awaited<ReturnType<typeof readWeeklyTimetable>>['slots'][number];
type TimetableOptions = Awaited<ReturnType<AcademicsService['listTimetableOptions']>>;

function timeInMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours! * 60 + minutes!;
}

function roomKey(value: string | null | undefined): string | null {
  return value?.trim().toLocaleLowerCase() || null;
}

function overlaps(left: { weekday: number; startTime: string; endTime: string }, right: { weekday: number; startTime: string; endTime: string }) {
  return left.weekday === right.weekday && timeInMinutes(left.startTime) < timeInMinutes(right.endTime) &&
    timeInMinutes(left.endTime) > timeInMinutes(right.startTime);
}

function assertNoConflict(candidate: TimetableSlotInput & { teacherMembershipId?: string | null }, slots: SlotRecord[], ignoreId?: string) {
  for (const existing of slots) {
    if (existing.id === ignoreId || !overlaps(candidate, existing)) continue;
    const reasons: string[] = [];
    if (existing.sectionId === candidate.sectionId) reasons.push('section');
    if (candidate.teacherMembershipId && candidate.teacherMembershipId === existing.teacherMembershipId) reasons.push('teacher');
    const candidateRoom = roomKey(candidate.roomLabel);
    if (candidateRoom && candidateRoom === roomKey(existing.roomLabel)) reasons.push('room');
    if (reasons.length) throw new TimetableError('CONFLICT', `This time overlaps another slot for the same ${reasons.join(', ')}`);
  }
}

function assertNoInternalConflicts(slots: SlotRecord[]) {
  for (let index = 0; index < slots.length; index += 1) {
    const current = slots[index]!;
    assertNoConflict({ ...current, teacherMembershipId: current.teacherMembershipId }, slots.slice(index + 1));
  }
}

@Injectable()
export class TimetableService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AcademicsService) private readonly academics: AcademicsService,
    @Optional() @Inject(TIMETABLE_PERSISTENCE) private readonly persistence: TimetablePersistence = defaultPersistence,
  ) {}

  private ensureActorScope(actor: TimetableUserActor, scope: TimetableScope) {
    if (!actor.tenantId || actor.tenantId !== scope.tenantId) throw new TimetableError('NOT_FOUND', 'Timetable was not found');
  }

  private async validateReferences(tx: TenantTransaction, scope: TimetableScope, input: TimetableSlotInput): Promise<{ options: TimetableOptions; teacherMembershipId: string | null }> {
    const options = await this.academics.listTimetableOptions(tx, scope, input.sessionId);
    if (!options.sections.some((section) => section.id === input.sectionId)) {
      throw new TimetableError('NOT_FOUND', 'Section was not found in this school and academic session');
    }
    if (!options.subjects.some((subject) => subject.id === input.subjectId)) {
      throw new TimetableError('NOT_FOUND', 'Subject was not found in this school and academic session');
    }
    if (!input.teacherAssignmentId) return { options, teacherMembershipId: null };
    await this.academics.requireTimetableAssignment(tx, scope, input.sessionId, input.sectionId, input.subjectId, input.teacherAssignmentId);
    const assignment = options.teacherAssignments.find((item) => item.id === input.teacherAssignmentId &&
      item.sectionId === input.sectionId && item.subjectId === input.subjectId);
    if (!assignment) throw new TimetableError('CONFLICT', 'The assigned teacher is no longer eligible for this section and subject');
    return { options, teacherMembershipId: assignment.membershipId };
  }

  async read(scope: TimetableScope, sessionId: string, filters: TimetableFilters = {}) {
    return withTenantContext(this.database.db, scope.tenantId, async (tx) => {
      const [schedule, options] = await Promise.all([
        this.persistence.read(tx, scope, sessionId, filters),
        this.academics.listTimetableOptions(tx, scope, sessionId),
      ]);
      return { ...schedule, options };
    });
  }

  async createSlot(actor: TimetableUserActor, scope: TimetableScope, input: TimetableSlotInput) {
    this.ensureActorScope(actor, scope);
    const normalized = normalizeTimetableSlotInput(input);
    return withTenantContext(this.database.db, scope.tenantId, async (tx) => {
      const { teacherMembershipId } = await this.validateReferences(tx, scope, normalized);
      const timetable = await this.persistence.lockOrCreate(tx, scope, normalized.sessionId, actor);
      const current = await this.persistence.read(tx, scope, normalized.sessionId);
      assertNoConflict({ ...normalized, teacherMembershipId }, current.slots);
      return this.persistence.insert(tx, scope, timetable.id, normalized, actor);
    });
  }

  async updateSlot(actor: TimetableUserActor, scope: TimetableScope, slotId: string, input: TimetableSlotInput) {
    this.ensureActorScope(actor, scope);
    const normalized = normalizeTimetableSlotInput(input);
    return withTenantContext(this.database.db, scope.tenantId, async (tx) => {
      const { timetable } = await this.persistence.lockForSlot(tx, scope, slotId);
      if (timetable.sessionId !== normalized.sessionId) throw new TimetableError('INVALID', 'Choose the academic session assigned to this timetable');
      const { teacherMembershipId } = await this.validateReferences(tx, scope, normalized);
      const current = await this.persistence.read(tx, scope, normalized.sessionId);
      assertNoConflict({ ...normalized, teacherMembershipId }, current.slots, slotId);
      return this.persistence.update(tx, scope, slotId, normalized, actor);
    });
  }

  async deleteSlot(actor: TimetableUserActor, scope: TimetableScope, slotId: string) {
    this.ensureActorScope(actor, scope);
    return withTenantContext(this.database.db, scope.tenantId, async (tx) => {
      await this.persistence.lockForSlot(tx, scope, slotId);
      await this.persistence.delete(tx, scope, slotId, actor);
      return { deleted: true };
    });
  }

  async publish(actor: TimetableUserActor, scope: TimetableScope, sessionId: string) {
    this.ensureActorScope(actor, scope);
    return withTenantContext(this.database.db, scope.tenantId, async (tx) => {
      const timetable = await this.persistence.lockOrCreate(tx, scope, sessionId, actor);
      const current = await this.persistence.read(tx, scope, sessionId);
      for (const slot of current.slots) {
        const normalized = normalizeTimetableSlotInput(slot);
        const { teacherMembershipId } = await this.validateReferences(tx, scope, normalized);
        slot.teacherMembershipId = teacherMembershipId;
      }
      assertNoInternalConflicts(current.slots);
      return this.persistence.publish(tx, scope, timetable.id, actor);
    });
  }
}
