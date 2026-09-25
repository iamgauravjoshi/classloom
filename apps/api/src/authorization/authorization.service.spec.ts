import { describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from './authorization.service.js';
import type { AuthorizationGrant } from '@classloom/db';

const context = { tenantId: 'tenant-id', accountId: 'account-id', membershipId: 'membership-id' };
const grant: AuthorizationGrant = { permissionKey: 'attendance.read', scope: { kind: 'school', schoolId: 'school-a' } };

describe('AuthorizationService', () => {
  it('denies members with no permission and requires every requested permission', async () => {
    const list = vi.fn().mockResolvedValue([grant]);
    const service = new AuthorizationService({ listMembershipAuthorizationGrants: list });
    expect(await service.hasPermissions(context, ['authorization.roles.read'])).toBe(false);
    expect(await service.hasPermissions(context, ['attendance.read', 'attendance.record'], { kind: 'school', schoolId: 'school-a' })).toBe(false);
    expect(list).toHaveBeenCalledWith(context);
  });

  it('allows matching scoped grants and denies unsupported targets', async () => {
    const service = new AuthorizationService({ listMembershipAuthorizationGrants: async () => [grant] });
    expect(await service.hasPermissions(context, ['attendance.read'], { kind: 'campus', schoolId: 'school-a', campusId: 'campus-a' })).toBe(true);
    expect(await service.hasPermissions(context, ['attendance.read'], { kind: 'campus', schoolId: 'school-b', campusId: 'campus-b' })).toBe(false);
    expect(await service.hasPermissions(context, ['attendance.read'], { kind: 'student' } as never)).toBe(false);
  });

  it('denies missing identity fields and unknown permission keys before repository lookup', async () => {
    const list = vi.fn().mockResolvedValue([grant]);
    const service = new AuthorizationService({ listMembershipAuthorizationGrants: list });
    expect(await service.hasPermissions({ ...context, tenantId: null }, ['attendance.read'])).toBe(false);
    expect(await service.hasPermissions(context, ['unknown.permission' as never])).toBe(false);
    expect(list).not.toHaveBeenCalled();
  });
});
