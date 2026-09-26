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
