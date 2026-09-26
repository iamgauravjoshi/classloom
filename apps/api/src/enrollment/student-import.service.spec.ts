import { describe, expect, it } from 'vitest';
import { AuthorizationService, type AuthorizationGrantReader } from '../authorization/authorization.service.js';
import { StudentImportService } from './student-import.service.js';

const schoolId = '11111111-1111-4111-8111-111111111111';
const actor = { tenantId: 'tenant-1', accountId: 'account-1', membershipId: 'membership-1' };

function service(permissionKeys: string[]) {
  const reader: AuthorizationGrantReader = {
    listMembershipAuthorizationGrants: async () => permissionKeys.map((permissionKey) => ({ permissionKey: permissionKey as never, scope: { kind: 'school' as const, schoolId } })),
    isScopeInTenant: async () => true,
  };
  return new StudentImportService(new AuthorizationService(reader));
}

describe('StudentImportService authorization', () => {
  it('requires student, guardian, and enrollment manage permissions together', async () => {
    await expect(service(['student.manage', 'guardian.manage']).requireCommit(actor, schoolId)).rejects.toMatchObject({ status: 403 });
    await expect(service(['student.manage', 'guardian.manage', 'enrollment.manage']).requireCommit(actor, schoolId)).resolves.toBeUndefined();
  });
});
