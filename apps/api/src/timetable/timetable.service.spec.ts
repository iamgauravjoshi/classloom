import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@classloom/db';
import type { AcademicsService } from '../academics/academics.service.js';
import type { DatabaseService } from '../database/database.service.js';
import { TimetableError } from '@classloom/db';
import { TimetableService, type TimetablePersistence } from './timetable.service.js';

const actor = { tenantId: '11111111-1111-4111-8111-111111111111', accountId: '33333333-3333-4333-8333-333333333333', membershipId: '44444444-4444-4444-8444-444444444444' };
const scope = { tenantId: actor.tenantId, schoolId: '22222222-2222-4222-8222-222222222222' };
const sessionId = 'session-1';
const slotInput = {
  sessionId, sectionId: 'section-1', subjectId: 'subject-1', teacherAssignmentId: 'assignment-1',
  weekday: 1, startTime: '09:00', endTime: '09:40', roomLabel: 'Room 1',
};
const timetable = { id: 'timetable-1', tenantId: scope.tenantId, schoolId: scope.schoolId, sessionId, status: 'draft' as const };

function harness(options: { slots?: unknown[]; assigned?: boolean } = {}) {
  const tx = { execute: vi.fn() } as unknown as TenantTransaction;
  const database = { db: { transaction: vi.fn(async (work: (tx: TenantTransaction) => Promise<unknown>) => work(tx)) } } as unknown as DatabaseService;
  const persistence: TimetablePersistence = {
    read: vi.fn().mockResolvedValue({ timetable, slots: options.slots ?? [] }),
    lockOrCreate: vi.fn().mockResolvedValue(timetable),
    lockForSlot: vi.fn().mockResolvedValue({ timetable, slot: { id: 'slot-1', ...slotInput } }),
    insert: vi.fn().mockResolvedValue({ id: 'slot-new', ...slotInput }),
    update: vi.fn().mockResolvedValue({ id: 'slot-1', ...slotInput }),
    delete: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue({ ...timetable, status: 'published' }),
  };
  const academics = {
    listTimetableOptions: vi.fn().mockResolvedValue({
      sections: [{ id: 'section-1' }], subjects: [{ id: 'subject-1' }],
      teacherAssignments: options.assigned === false ? [] : [{ id: 'assignment-1', sectionId: 'section-1', subjectId: 'subject-1', membershipId: 'teacher-1' }],
    }),
    requireTimetableAssignment: vi.fn().mockResolvedValue(undefined),
  } as unknown as AcademicsService;
  return { tx, persistence, academics, service: new TimetableService(database, academics, persistence) };
}

describe('TimetableService slot validation and lifecycle', () => {
  it('rejects overlapping slots for the same section', async () => {
    const { service, persistence } = harness({ slots: [{ id: 'existing', ...slotInput, teacherMembershipId: 'teacher-1' }] });
    await expect(service.createSlot(actor, scope, slotInput)).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('section') });
    expect(persistence.insert).not.toHaveBeenCalled();
  });

  it('rejects overlapping slots for the same teacher across sections', async () => {
    const existing = { ...slotInput, id: 'existing', sectionId: 'section-2', teacherAssignmentId: 'assignment-2', teacherMembershipId: 'teacher-1' };
    const { service, persistence } = harness({ slots: [existing] });
    await expect(service.createSlot(actor, scope, { ...slotInput, sectionId: 'section-1' }))
      .rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('teacher') });
    expect(persistence.insert).not.toHaveBeenCalled();
  });

  it('rejects case-insensitive, trimmed room conflicts', async () => {
    const existing = { ...slotInput, id: 'existing', sectionId: 'section-2', teacherMembershipId: 'teacher-2', roomLabel: '  rOoM 1 ' };
    const { service } = harness({ slots: [existing] });
    await expect(service.createSlot(actor, scope, slotInput)).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('room') });
  });

  it('allows adjacent slots and persists an unassigned teacher slot', async () => {
    const { service, persistence, academics } = harness({ slots: [{ ...slotInput, id: 'existing', endTime: '09:00', teacherMembershipId: 'teacher-1' }], assigned: false });
    await expect(service.createSlot(actor, scope, { ...slotInput, teacherAssignmentId: null })).resolves.toMatchObject({ id: 'slot-new' });
    expect(academics.requireTimetableAssignment).toHaveBeenCalledTimes(0);
    expect(persistence.insert).toHaveBeenCalledWith(expect.anything(), scope, timetable.id, expect.objectContaining({ teacherAssignmentId: null }), actor);
  });

  it('rejects invalid weekdays and times before opening a mutation', async () => {
    const { service, persistence } = harness();
    await expect(service.createSlot(actor, scope, { ...slotInput, weekday: 8 })).rejects.toBeInstanceOf(TimetableError);
    await expect(service.createSlot(actor, scope, { ...slotInput, startTime: '10:00', endTime: '09:00' })).rejects.toMatchObject({ code: 'INVALID' });
    expect(persistence.lockOrCreate).not.toHaveBeenCalled();
  });

  it('publishes only after schedule validation and delegates atomic audit recording', async () => {
    const { service, persistence } = harness();
    await expect(service.publish(actor, scope, sessionId)).resolves.toMatchObject({ status: 'published' });
    expect(persistence.publish).toHaveBeenCalledWith(expect.anything(), scope, timetable.id, actor);
  });

  it('validates persisted PostgreSQL time values when publishing', async () => {
    const persisted = { ...slotInput, id: 'slot-persisted', startTime: '09:00:00', endTime: '09:40:00', teacherMembershipId: 'teacher-1' };
    const { service, persistence } = harness({ slots: [persisted] });
    await expect(service.publish(actor, scope, sessionId)).resolves.toMatchObject({ status: 'published' });
    expect(persistence.publish).toHaveBeenCalled();
  });

  it('moves edits to a published timetable back to draft before republishing', async () => {
    const published = { ...timetable, status: 'published' as const };
    const { service, persistence } = harness();
    vi.mocked(persistence.lockForSlot).mockResolvedValue({ timetable: published, slot: { id: 'slot-1', ...slotInput } } as unknown as Awaited<ReturnType<TimetablePersistence['lockForSlot']>>);
    await service.updateSlot(actor, scope, 'slot-1', { ...slotInput, startTime: '10:00', endTime: '10:40' });
    expect(persistence.update).toHaveBeenCalled();
  });

  it('deletes a slot through the locked timetable persistence operation', async () => {
    const { service, persistence } = harness();
    await service.deleteSlot(actor, scope, 'slot-1');
    expect(persistence.lockForSlot).toHaveBeenCalled();
    expect(persistence.delete).toHaveBeenCalledWith(expect.anything(), scope, 'slot-1', actor);
  });
});
