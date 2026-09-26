import { describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@classloom/db';
import { AuthorizationService, type AuthorizationGrantReader } from '../authorization/authorization.service.js';
import { StudentPeopleService } from './student-people.service.js';

const schoolOne = '11111111-1111-4111-8111-111111111111';
const schoolTwo = '22222222-2222-4222-8222-222222222222';
const actor = { tenantId: 'tenant-a', accountId: 'account-a', membershipId: 'membership-a' };

function serviceWithPermissions(grants: Array<{ permissionKey: string; schoolId: string }>) {
  const reader: AuthorizationGrantReader = {
    listMembershipAuthorizationGrants: async () => grants.map(({ permissionKey, schoolId }) => ({
      permissionKey: permissionKey as never,
      scope: { kind: 'school' as const, schoolId },
    })),
    isScopeInTenant: async (_context, scope) => scope.kind === 'school' && [schoolOne, schoolTwo].includes(scope.schoolId),
  };
  return new StudentPeopleService(new AuthorizationService(reader));
}

describe('StudentPeopleService authorization', () => {
  it('requires the matching school permission for each directory', async () => {
    const service = serviceWithPermissions([
      { permissionKey: 'student.read', schoolId: schoolOne },
      { permissionKey: 'guardian.manage', schoolId: schoolOne },
    ]);
    await expect(service.requireStudentRead(actor, schoolOne)).resolves.toBeUndefined();
    await expect(service.requireStudentManage(actor, schoolOne)).rejects.toMatchObject({ status: 403 });
    await expect(service.requireGuardianManage(actor, schoolOne)).resolves.toBeUndefined();
    await expect(service.requireGuardianRead(actor, schoolTwo)).rejects.toMatchObject({ status: 403 });
  });

  it('allows shared edits only when every active enrollment school is manageable', async () => {
    const service = serviceWithPermissions([
      { permissionKey: 'student.manage', schoolId: schoolOne },
      { permissionKey: 'guardian.manage', schoolId: schoolOne },
    ]);
    await expect(service.requireSharedStudentManage(actor, [schoolOne])).resolves.toBeUndefined();
    await expect(service.requireSharedStudentManage(actor, [schoolOne, schoolTwo])).rejects.toThrow(/every active school/i);
    await expect(service.requireSharedGuardianManage(actor, [])).rejects.toThrow(/active school/i);
  });

  it('delegates transaction-aware resolve operations to People persistence', async () => {
    const service = serviceWithPermissions([]);
    const tx = {} as TenantTransaction;
    const createStudent = vi.fn().mockResolvedValue({ id: 'student-1' });
    const createGuardian = vi.fn().mockResolvedValue({ id: 'guardian-1' });
    const createRelationship = vi.fn().mockResolvedValue({ id: 'relationship-1' });
    const persistence = {
      findStudent: vi.fn().mockResolvedValue(null),
      findGuardian: vi.fn().mockResolvedValue(null),
      createStudent,
      createGuardian,
      createRelationship,
    };

    await expect(service.createOrResolveStudent(tx, 'tenant-a', {
      studentCode: 'S-1', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2013-08-14',
    }, { actorAccountId: 'account-a' }, persistence)).resolves.toEqual({ id: 'student-1' });
    await expect(service.createOrResolveGuardian(tx, 'tenant-a', {
      guardianCode: 'G-1', givenName: 'Ravi', familyName: 'Rao',
    }, { actorAccountId: 'account-a' }, persistence)).resolves.toEqual({ id: 'guardian-1' });
    await expect(service.createOrResolveRelationship(tx, 'tenant-a', 'student-1', 'guardian-1', {
      relationshipType: 'father',
    }, { actorAccountId: 'account-a' }, persistence)).resolves.toEqual({ id: 'relationship-1' });
  });
});
