import { describe, expect, it } from 'vitest';
import { AuthorizationService, type AuthorizationGrantReader } from '../authorization/authorization.service.js';
import { PeopleService } from './people.service.js';

const schoolOne = '11111111-1111-4111-8111-111111111111';
const schoolTwo = '22222222-2222-4222-8222-222222222222';
const actor = { tenantId: 'tenant-a', accountId: 'account-a', membershipId: 'membership-a' };

function serviceWithSchoolManage(schoolIds: string[]) {
  const reader: AuthorizationGrantReader = {
    listMembershipAuthorizationGrants: async () => schoolIds.map((schoolId) => ({
      permissionKey: 'staff.manage', scope: { kind: 'school' as const, schoolId },
    })),
    isScopeInTenant: async (_context, scope) => scope.kind === 'school' && [schoolOne, schoolTwo].includes(scope.schoolId),
  };
  return new PeopleService(new AuthorizationService(reader));
}

describe('PeopleService shared staff permission', () => {
  it('allows shared edits only when the actor manages every affiliated school', async () => {
    const oneSchoolManager = serviceWithSchoolManage([schoolOne]);
    expect(await oneSchoolManager.canEditShared(actor, [schoolOne])).toBe(true);
    expect(await oneSchoolManager.canEditShared(actor, [schoolOne, schoolTwo])).toBe(false);
    await expect(oneSchoolManager.requireSharedManage(actor, [schoolOne, schoolTwo])).rejects.toMatchObject({ status: 403 });
    expect(await serviceWithSchoolManage([schoolOne, schoolTwo]).canEditShared(actor, [schoolOne, schoolTwo])).toBe(true);
  });

  it('fails closed for a profile with no school affiliation', async () => {
    expect(await serviceWithSchoolManage([schoolOne]).canEditShared(actor, [])).toBe(false);
  });
});
