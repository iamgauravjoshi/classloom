import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@classloom/db';
import type { AuthorizationService } from '../authorization/authorization.service.js';
import type { EnrollmentService } from '../enrollment/enrollment.service.js';
import { AdmissionsService } from './admissions.service.js';

const actor = { tenantId: 'tenant-1', accountId: 'account-1', membershipId: 'membership-1' };
const schoolId = '11111111-1111-4111-8111-111111111111';
const caseId = '22222222-2222-4222-8222-222222222222';

function permissions(...keys: string[]) {
  const hasPermissions = vi.fn(async (_actor, requested: readonly string[]) => requested.every((key) => keys.includes(key)));
  return { service: { hasPermissions } as unknown as AuthorizationService, hasPermissions };
}

function persistence() {
  return {
    create: vi.fn(), get: vi.fn(), list: vi.fn(), update: vi.fn(), transition: vi.fn(), events: vi.fn(), convert: vi.fn(),
  };
}

describe('AdmissionsService', () => {
  it('requires school-scoped admissions.read before listing', async () => {
    const rights = permissions();
    const store = persistence();
    const service = new AdmissionsService(rights.service, store, {} as EnrollmentService);
    await expect(service.list({} as TenantTransaction, actor, schoolId, {})).rejects.toBeInstanceOf(ForbiddenException);
    expect(rights.hasPermissions).toHaveBeenCalledWith(actor, ['admissions.read'], { kind: 'school', schoolId });
    expect(store.list).not.toHaveBeenCalled();
  });

  it('creates a case only with admissions.manage and passes the authenticated actor to persistence', async () => {
    const store = persistence();
    store.create.mockResolvedValue({ id: caseId, status: 'enquiry' });
    const service = new AdmissionsService(permissions('admissions.manage').service, store, {} as EnrollmentService);
    const tx = {} as TenantTransaction;
    const input = { studentGivenName: 'Asha', studentFamilyName: 'Shah' };
    await expect(service.create(tx, actor, schoolId, input)).resolves.toMatchObject({ id: caseId });
    expect(store.create).toHaveBeenCalledWith(tx, { tenantId: actor.tenantId, schoolId }, input, actor);
  });

  it('requires admissions.convert and performs enrollment plus case conversion through the same transaction', async () => {
    const store = persistence();
    store.get.mockResolvedValue({ id: caseId, status: 'accepted', guardians: [], studentGivenName: 'Asha', studentFamilyName: 'Shah', studentDateOfBirth: '2014-01-01', existingStudentId: null });
    store.convert.mockResolvedValue({ id: caseId, status: 'admitted' });
    const admitStudentFromAdmissions = vi.fn().mockResolvedValue({
      student: { id: 'student-1' }, schoolEnrollment: { id: 'school-enrollment-1' }, academicEnrollment: { id: 'academic-enrollment-1' }, guardians: [],
    });
    const enrollment = { admitStudentFromAdmissions } as unknown as EnrollmentService;
    const service = new AdmissionsService(permissions('admissions.convert').service, store, enrollment);
    const tx = {} as TenantTransaction;
    const input = {
      studentCode: 'S1',
      schoolEnrollment: { admissionNumber: 'A1', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1', startDate: '2026-04-01' },
    };
    await expect(service.admit(tx, actor, schoolId, caseId, input)).resolves.toMatchObject({ status: 'admitted' });
    expect(admitStudentFromAdmissions).toHaveBeenCalledWith(tx, actor, schoolId, {
      student: { studentCode: 'S1', givenName: 'Asha', middleName: undefined, familyName: 'Shah', preferredName: undefined, dateOfBirth: '2014-01-01', gender: undefined, email: undefined, phone: undefined },
      schoolEnrollment: input.schoolEnrollment, academicEnrollment: input.academicEnrollment, guardians: [],
    });
    expect(store.convert).toHaveBeenCalledWith(tx, { tenantId: actor.tenantId, schoolId }, caseId, {
      studentId: 'student-1', schoolEnrollmentId: 'school-enrollment-1', academicEnrollmentId: 'academic-enrollment-1',
    }, actor);
  });

  it('rejects stale conversion before creating enrollment records', async () => {
    const store = persistence();
    store.get.mockResolvedValue({ id: caseId, status: 'admitted', guardians: [] });
    const admitStudentFromAdmissions = vi.fn();
    const enrollment = { admitStudentFromAdmissions } as unknown as EnrollmentService;
    const service = new AdmissionsService(permissions('admissions.convert').service, store, enrollment);
    await expect(service.admit({} as TenantTransaction, actor, schoolId, caseId, {} as never)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(admitStudentFromAdmissions).not.toHaveBeenCalled();
  });
});
