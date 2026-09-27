import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@classloom/db';
import { AcademicsService } from './academics.service.js';
import type { PeopleService } from '../people/people.service.js';

describe('AcademicsService enrollment placement contract', () => {
  it('delegates placement validation inside the caller transaction', async () => {
    const resolver = vi.fn().mockResolvedValue({
      sessionId: 'session-1', sessionName: '2026–27', classId: 'class-1', className: 'Grade 8', sectionId: 'section-1', sectionName: 'A',
    });
    const service = new AcademicsService(resolver);
    const tx = {} as TenantTransaction;
    await expect(service.requireEnrollmentPlacement(tx, { tenantId: 'tenant-1', schoolId: 'school-1' }, {
      sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1',
    })).resolves.toMatchObject({ sectionId: 'section-1' });
    expect(resolver).toHaveBeenCalledWith(tx, { tenantId: 'tenant-1', schoolId: 'school-1' }, {
      sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1',
    });
  });
});

describe('AcademicsService timetable contracts', () => {
  type TestScope = { tenantId: string; schoolId: string };
  const scope: TestScope = { tenantId: 'tenant-1', schoolId: 'school-1' };
  const tx = {} as TenantTransaction;
  const setup = {
    school: { id: scope.schoolId, name: 'Demo School', code: 'DEMO' },
    sessions: [{ id: 'session-1', name: '2026–27', status: 'active' }],
    classes: [{ id: 'class-1', sessionId: 'session-1', name: 'Grade 8', code: 'G8' }],
    sections: [{ id: 'section-1', classId: 'class-1', sessionId: 'session-1', name: 'A', code: 'A' }],
    subjects: [{ id: 'subject-1', sessionId: 'session-1', name: 'Science', code: 'SCI' }],
    assignments: [{ id: 'assignment-1', sessionId: 'session-1', sectionId: 'section-1', subjectId: 'subject-1', membershipId: 'teacher-1' }],
    assignmentAccounts: [],
  };

  function serviceWith(reader = vi.fn().mockResolvedValue(setup), peopleOverrides: Partial<PeopleService> = {}) {
    const people = {
      listAssignableTeachers: vi.fn().mockResolvedValue([{ id: 'teacher-1', displayName: 'Taylor Teacher', email: 'taylor@example.test' }]),
      canAssignTeacher: vi.fn().mockResolvedValue(true),
      ...peopleOverrides,
    } as unknown as PeopleService;
    const service = new AcademicsService() as unknown as {
      listTimetableOptions(tx: TenantTransaction, scope: TestScope, sessionId: string): Promise<unknown>;
      requireTimetableAssignment(tx: TenantTransaction, scope: TestScope, sessionId: string, sectionId: string, subjectId: string, assignmentId: string): Promise<void>;
    };
    Object.assign(service, { setupReader: reader, people });
    return { service, reader, people };
  }

  it('returns empty schedule options for a valid session without setup records', async () => {
    const emptySetup = { ...setup, classes: [], sections: [], subjects: [], assignments: [] };
    const reader = vi.fn().mockResolvedValue(emptySetup);
    const { service } = serviceWith(reader);
    await expect(service.listTimetableOptions(tx, scope, 'session-1')).resolves.toEqual({ sections: [], subjects: [], teacherAssignments: [] });
  });

  it('rejects a session outside the requested school', async () => {
    const reader = vi.fn().mockResolvedValue({ ...setup, sessions: [] });
    const { service } = serviceWith(reader);
    await expect(service.listTimetableOptions(tx, scope, 'other-session')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects a teacher assignment that does not match the selected section and subject', async () => {
    const { service } = serviceWith();
    await expect(service.requireTimetableAssignment(tx, scope, 'session-1', 'other-section', 'subject-1', 'assignment-1'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects an assignment when its teacher is no longer eligible', async () => {
    const { service, people } = serviceWith(undefined, { canAssignTeacher: vi.fn().mockResolvedValue(false) });
    await expect(service.requireTimetableAssignment(tx, scope, 'session-1', 'section-1', 'subject-1', 'assignment-1'))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    expect(people.canAssignTeacher.mock.calls[0]).toEqual([tx, scope, 'teacher-1']);
  });
});
