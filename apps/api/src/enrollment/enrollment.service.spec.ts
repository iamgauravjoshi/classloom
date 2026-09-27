import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@classloom/db';
import { AuthorizationService, type AuthorizationGrantReader } from '../authorization/authorization.service.js';
import { AcademicsService } from '../academics/academics.service.js';
import { StudentPeopleService } from '../people/student-people.service.js';
import { EnrollmentService } from './enrollment.service.js';

const actor = { tenantId: 'tenant-1', accountId: 'account-1', membershipId: 'membership-1' };
const schoolId = '11111111-1111-4111-8111-111111111111';

function authorization(permissionKeys: string[]) {
  const reader: AuthorizationGrantReader = {
    listMembershipAuthorizationGrants: async () => permissionKeys.map((permissionKey) => ({
      permissionKey: permissionKey as never, scope: { kind: 'school' as const, schoolId },
    })),
    isScopeInTenant: async () => true,
  };
  return new AuthorizationService(reader);
}

describe('EnrollmentService', () => {
  it('creates an admission through People and Academics contracts in one transaction', async () => {
    const rights = authorization(['student.manage', 'guardian.manage', 'enrollment.manage']);
    const people = new StudentPeopleService(rights);
    const createStudent = vi.spyOn(people, 'createOrResolveStudent').mockResolvedValue({ id: 'student-1' } as never);
    const createGuardian = vi.spyOn(people, 'createOrResolveGuardian').mockResolvedValue({ id: 'guardian-1' } as never);
    const createRelationship = vi.spyOn(people, 'createOrResolveRelationship').mockResolvedValue({ id: 'relationship-1' } as never);
    const placement = { sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1' };
    const persistence = { createSchool: vi.fn().mockResolvedValue({ id: 'school-enrollment-1' }), createAcademic: vi.fn().mockResolvedValue({ id: 'academic-1' }), transfer: vi.fn(), withdraw: vi.fn(), complete: vi.fn() };
    const service = new EnrollmentService(rights, people, new AcademicsService(vi.fn().mockResolvedValue(placement)), persistence);
    const tx = {} as TenantTransaction;
    const input = {
      student: { studentCode: 'S1', givenName: 'Asha', familyName: 'Shah', dateOfBirth: '2014-01-01' },
      schoolEnrollment: { admissionNumber: 'A1', admissionDate: '2026-04-01' },
      academicEnrollment: { ...placement, startDate: '2026-04-01' },
      guardians: [{ guardian: { guardianCode: 'G1', givenName: 'Mira', familyName: 'Shah' }, relationship: { relationshipType: 'mother' as const, primaryContact: true } }],
    };
    const result = await service.admitStudent(tx, actor, schoolId, input);
    expect(result).toMatchObject({ student: { id: 'student-1' }, schoolEnrollment: { id: 'school-enrollment-1' }, academicEnrollment: { id: 'academic-1' } });
    expect(createStudent).toHaveBeenCalledWith(tx, actor.tenantId, input.student, { actorAccountId: actor.accountId, requestId: undefined });
    expect(createGuardian).toHaveBeenCalledWith(tx, actor.tenantId, input.guardians[0]!.guardian, { actorAccountId: actor.accountId, requestId: undefined });
    expect(createRelationship).toHaveBeenCalledWith(tx, actor.tenantId, 'student-1', 'guardian-1', input.guardians[0]!.relationship, { actorAccountId: actor.accountId, requestId: undefined });
    expect(persistence.createSchool).toHaveBeenCalledOnce();
    expect(persistence.createAcademic).toHaveBeenCalledOnce();
  });

  it('rejects an admission when guardian management is missing', async () => {
    const rights = authorization(['student.manage', 'enrollment.manage']);
    const people = new StudentPeopleService(rights);
    const createStudent = vi.spyOn(people, 'createOrResolveStudent');
    const service = new EnrollmentService(rights, people, new AcademicsService(vi.fn()));
    await expect(service.admitStudent({} as TenantTransaction, actor, schoolId, {
      student: { studentCode: 'S1', givenName: 'Asha', familyName: 'Shah', dateOfBirth: '2014-01-01' },
      schoolEnrollment: { admissionNumber: 'A1', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1', startDate: '2026-04-01' },
      guardians: [{ guardian: { guardianCode: 'G1', givenName: 'Mira', familyName: 'Shah' }, relationship: { relationshipType: 'mother' } }],
    })).rejects.toMatchObject({ status: 403 });
    expect(createStudent).not.toHaveBeenCalled();
  });

  it('allows atomic admissions conversion with admissions.convert and without broad student or enrollment grants', async () => {
    const rights = authorization(['admissions.convert']);
    const people = new StudentPeopleService(rights);
    vi.spyOn(people, 'createOrResolveStudent').mockResolvedValue({ id: 'student-1' } as never);
    const placement = { sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1' };
    const persistence = { createSchool: vi.fn().mockResolvedValue({ id: 'school-enrollment-1' }), createAcademic: vi.fn().mockResolvedValue({ id: 'academic-1' }), transfer: vi.fn(), withdraw: vi.fn(), complete: vi.fn() };
    const service = new EnrollmentService(rights, people, new AcademicsService(vi.fn().mockResolvedValue(placement)), persistence);
    const result = await service.admitStudentFromAdmissions({} as TenantTransaction, actor, schoolId, {
      student: { studentCode: 'S1', givenName: 'Asha', familyName: 'Shah', dateOfBirth: '2014-01-01' },
      schoolEnrollment: { admissionNumber: 'A1', admissionDate: '2026-04-01' },
      academicEnrollment: { ...placement, startDate: '2026-04-01' },
    });
    expect(result).toMatchObject({ student: { id: 'student-1' }, schoolEnrollment: { id: 'school-enrollment-1' }, academicEnrollment: { id: 'academic-1' } });
    expect(persistence.createSchool).toHaveBeenCalledOnce();
    expect(persistence.createAcademic).toHaveBeenCalledOnce();
  });

  it('rejects admissions conversion without admissions.convert', async () => {
    const rights = authorization(['student.manage', 'enrollment.manage']);
    const service = new EnrollmentService(rights, new StudentPeopleService(rights), new AcademicsService(vi.fn()));
    await expect(service.admitStudentFromAdmissions({} as TenantTransaction, actor, schoolId, {
      student: { studentCode: 'S1', givenName: 'Asha', familyName: 'Shah', dateOfBirth: '2014-01-01' },
      schoolEnrollment: { admissionNumber: 'A1', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1', startDate: '2026-04-01' },
    })).rejects.toMatchObject({ status: 403 });
  });

  it('validates explicitly linked student and guardian profiles through People', async () => {
    const rights = authorization(['admissions.convert']);
    const people = new StudentPeopleService(rights);
    const student = vi.spyOn(people, 'getStudentById').mockResolvedValue({ id: 'student-linked' } as never);
    const guardian = vi.spyOn(people, 'getGuardianById').mockResolvedValue({ id: 'guardian-linked' } as never);
    const relationship = vi.spyOn(people, 'createOrResolveRelationship').mockResolvedValue({ id: 'relationship-linked' } as never);
    const persistence = { createSchool: vi.fn().mockResolvedValue({ id: 'school-enrollment-linked' }), createAcademic: vi.fn().mockResolvedValue({ id: 'academic-linked' }), transfer: vi.fn(), withdraw: vi.fn(), complete: vi.fn() };
    const service = new EnrollmentService(rights, people, new AcademicsService(vi.fn().mockResolvedValue({ sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1' })), persistence);
    const tx = {} as TenantTransaction;
    await service.admitStudentFromAdmissions(tx, actor, schoolId, {
      existingStudentId: 'student-linked',
      schoolEnrollment: { admissionNumber: 'A-LINKED', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1', startDate: '2026-04-01' },
      guardians: [{ guardianProfileId: 'guardian-linked', relationship: { relationshipType: 'mother' } }],
    });
    expect(student).toHaveBeenCalledWith(tx, actor.tenantId, 'student-linked');
    expect(guardian).toHaveBeenCalledWith(tx, actor.tenantId, 'guardian-linked');
    expect(relationship).toHaveBeenCalledWith(tx, actor.tenantId, 'student-linked', 'guardian-linked', { relationshipType: 'mother' }, expect.anything());
    expect(persistence.createSchool).toHaveBeenCalledWith(tx, { tenantId: actor.tenantId, schoolId }, 'student-linked', expect.anything(), expect.anything());
  });
  it('enforces school enrollment permissions', async () => {
    const service = new EnrollmentService(
      authorization(['enrollment.read']),
      new StudentPeopleService(authorization([])),
      new AcademicsService(vi.fn()),
    );
    await expect(service.requireRead(actor, schoolId)).resolves.toBeUndefined();
    await expect(service.requireManage(actor, schoolId)).rejects.toMatchObject({ status: 403 });
  });

  it('resolves academic placement and delegates initial enrollment in one transaction', async () => {
    const placement = { sessionId: 'session-1', sessionName: '2026–27', classId: 'class-1', className: 'Grade 8', sectionId: 'section-1', sectionName: 'A' };
    const academic = new AcademicsService(vi.fn().mockResolvedValue(placement));
    const createAcademic = vi.fn().mockResolvedValue({ id: 'enrollment-1' });
    const service = new EnrollmentService(
      authorization(['enrollment.manage']),
      new StudentPeopleService(authorization([])),
      academic,
      { createSchool: vi.fn(), createAcademic, transfer: vi.fn(), withdraw: vi.fn(), complete: vi.fn() },
    );
    const tx = {} as TenantTransaction;
    await expect(service.createAcademicEnrollment(tx, actor, schoolId, 'school-enrollment-1', {
      sessionId: 'session-1', classId: 'class-1', sectionId: 'section-1', rollNumber: '8', startDate: '2026-04-01',
    })).resolves.toEqual({ id: 'enrollment-1' });
    expect(createAcademic).toHaveBeenCalledWith(tx, { tenantId: actor.tenantId, schoolId }, 'school-enrollment-1', placement, {
      rollNumber: '8', startDate: '2026-04-01',
    }, { actorAccountId: actor.accountId });
  });
});
