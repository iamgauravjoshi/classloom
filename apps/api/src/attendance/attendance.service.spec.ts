import { ForbiddenException } from '@nestjs/common';
import { AttendanceError, type TenantTransaction } from '@classloom/db';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceService, schoolLocalDate, type AttendanceUserActor } from './attendance.service.js';

const actor: AttendanceUserActor = {
  tenantId: 'tenant-1', accountId: 'account-1', membershipId: 'membership-1', requestId: 'request-1',
};
const scope = { tenantId: 'tenant-1', schoolId: 'school-1' };
const tx = {} as TenantTransaction;
const section = { id: 'section-1', classId: 'class-1', className: 'Grade 8', classCode: 'G8', name: 'A', code: 'A', label: 'Grade 8 · A' };

function serviceWith(options: { permissions?: string[]; linked?: boolean; eligible?: boolean } = {}) {
  const permissions = options.permissions ?? ['attendance.read', 'attendance.record'];
  const authorization = { hasPermissions: vi.fn(async (_actor, keys: string[]) => keys.every((key) => permissions.includes(key)) ) };
  const enrollment = { listAttendanceRoster: vi.fn().mockResolvedValue([]) };
  const academics = {
    listAttendanceSessions: vi.fn().mockResolvedValue([{ id: 'session-1', startDate: '2026-04-01', endDate: '2027-03-31' }]),
    listAttendanceSections: vi.fn().mockResolvedValue([section]),
  };
  const people = { getAttendanceTeacherLink: vi.fn().mockResolvedValue({ linked: options.linked ?? false, eligible: options.eligible ?? false }) };
  const persistence = {
    read: vi.fn().mockResolvedValue({ register: null, entries: [], completion: { total: 0, unmarked: 0, complete: false } }),
    save: vi.fn(), register: vi.fn(), events: vi.fn(),
  };
  const tenantRunner = vi.fn(async (_db, _tenantId, callback) => callback(tx));
  const schoolReader = vi.fn().mockResolvedValue({ id: scope.schoolId, timezone: 'UTC' });
  const service = new AttendanceService(
    { db: {} } as never,
    authorization as never,
    enrollment as never,
    academics as never,
    people as never,
    persistence,
    tenantRunner,
    schoolReader,
  );
  return { service, authorization, enrollment, academics, people, persistence, tenantRunner, schoolReader };
}

describe('AttendanceService', () => {
  it('formats school-local dates across timezone offsets and daylight-saving time', () => {
    expect(schoolLocalDate(new Date('2026-09-28T01:00:00.000Z'), 'America/Los_Angeles')).toBe('2026-09-27');
    expect(schoolLocalDate(new Date('2026-03-08T09:30:00.000Z'), 'America/Los_Angeles')).toBe('2026-03-08');
    expect(() => schoolLocalDate(new Date(), 'Not/A-Timezone')).toThrow(AttendanceError);
  });

  it('limits an eligible linked teacher to assigned sections', async () => {
    const { service, academics, people } = serviceWith({ linked: true, eligible: true });
    await service.listSections(actor, scope, 'session-1');
    expect(people.getAttendanceTeacherLink).toHaveBeenCalledWith(tx, scope, actor.membershipId);
    expect(academics.listAttendanceSections).toHaveBeenCalledWith(tx, scope, 'session-1', actor.membershipId);
  });

  it('returns no sections when a linked teacher is no longer eligible', async () => {
    const { service, academics } = serviceWith({ linked: true, eligible: false });
    await expect(service.listSections(actor, scope, 'session-1')).resolves.toEqual([]);
    expect(academics.listAttendanceSections).not.toHaveBeenCalled();
  });

  it('fails closed when recording permission is missing', async () => {
    const { service, tenantRunner } = serviceWith({ permissions: ['attendance.read'] });
    await expect(service.saveRegister(actor, scope, {
      sessionId: 'session-1', sectionId: 'section-1', date: '2026-09-28',
    }, [{ academicEnrollmentId: 'enrollment-1', status: 'present' }])).rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantRunner).not.toHaveBeenCalled();
  });

  it('rejects future dates in the school timezone before reading attendance', async () => {
    const { service, persistence } = serviceWith();
    const today = schoolLocalDate(new Date(), 'UTC');
    const future = new Date(`${today}T00:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 1);
    const futureDate = future.toISOString().slice(0, 10);
    await expect(service.readRegister(actor, scope, {
      sessionId: 'session-1', sectionId: 'section-1', date: futureDate,
    })).rejects.toMatchObject({ code: 'INVALID' });
    expect(persistence.read).not.toHaveBeenCalled();
  });
});
