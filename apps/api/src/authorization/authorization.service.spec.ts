import { describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from './authorization.service.js';
import type { AuthorizationGrant } from '@classloom/db';

const context = { tenantId: 'tenant-id', accountId: 'account-id', membershipId: 'membership-id' };
const grant: AuthorizationGrant = { permissionKey: 'attendance.read', scope: { kind: 'school', schoolId: 'school-a' } };

describe('AuthorizationService', () => {
  it('denies members with no permission and requires every requested permission', async () => {
    const list = vi.fn().mockResolvedValue([grant]);
    const service = new AuthorizationService({ listMembershipAuthorizationGrants: list, isScopeInTenant: async () => true });
    expect(await service.hasPermissions(context, ['authorization.roles.read'])).toBe(false);
    expect(await service.hasPermissions(context, ['attendance.read', 'attendance.record'], { kind: 'school', schoolId: 'school-a' })).toBe(false);
    expect(list).toHaveBeenCalledWith(context);
  });

  it('requires resolved target scopes for resource permissions and validates them in the tenant', async () => {
    const isScopeInTenant = vi.fn().mockResolvedValue(true);
    const service = new AuthorizationService({
      listMembershipAuthorizationGrants: async () => [
        { permissionKey: 'school.read', scope: { kind: 'tenant' } },
        { permissionKey: 'marks.enter', scope: { kind: 'tenant' } },
      ],
      isScopeInTenant,
    });
    expect(await service.hasPermissions(context, ['school.read'])).toBe(false);
    expect(await service.hasPermissions(context, ['marks.enter'], { kind: 'school', schoolId: 'school-a' })).toBe(false);
    expect(isScopeInTenant).not.toHaveBeenCalled();
    expect(await service.hasPermissions(context, ['school.read'], { kind: 'school', schoolId: 'school-a' })).toBe(true);
    isScopeInTenant.mockResolvedValueOnce(false);
    expect(await service.hasPermissions(context, ['school.read'], { kind: 'school', schoolId: 'foreign-school' })).toBe(false);
  });

  it('keeps tenant permissions tenant scoped when target scope is omitted', async () => {
    const service = new AuthorizationService({
      listMembershipAuthorizationGrants: async () => [{ permissionKey: 'authorization.roles.read', scope: { kind: 'tenant' } }],
      isScopeInTenant: async () => true,
    });
    expect(await service.hasPermissions(context, ['authorization.roles.read'])).toBe(true);
  });

  it('allows matching scoped grants and denies unsupported targets', async () => {
    const service = new AuthorizationService({ listMembershipAuthorizationGrants: async () => [grant], isScopeInTenant: async () => true });
    expect(await service.hasPermissions(context, ['attendance.read'], { kind: 'campus', schoolId: 'school-a', campusId: 'campus-a' })).toBe(true);
    expect(await service.hasPermissions(context, ['attendance.read'], { kind: 'campus', schoolId: 'school-b', campusId: 'campus-b' })).toBe(false);
    expect(await service.hasPermissions(context, ['attendance.read'], { kind: 'student' } as never)).toBe(false);
  });

  it('denies missing identity fields and unknown permission keys before repository lookup', async () => {
    const list = vi.fn().mockResolvedValue([grant]);
    const service = new AuthorizationService({ listMembershipAuthorizationGrants: list, isScopeInTenant: async () => true });
    expect(await service.hasPermissions({ ...context, tenantId: null }, ['attendance.read'])).toBe(false);
    expect(await service.hasPermissions(context, ['unknown.permission' as never])).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });
});
