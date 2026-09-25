import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationGuard } from './authorization.guard.js';

function executionContext(auth?: unknown) {
  return {
    getHandler: () => ({}), getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ auth }) }),
  } as never;
}

describe('AuthorizationGuard', () => {
  it('returns 403 when request auth context is missing', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['attendance.read']) };
    const service = { hasPermissions: vi.fn() };
    const guard = new AuthorizationGuard(reflector as never, service as never);
    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.hasPermissions).not.toHaveBeenCalled();
  });

  it('requires every permission and denies an unauthorized request', async () => {
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['attendance.read', 'attendance.record']) };
    const service = { hasPermissions: vi.fn().mockResolvedValue(false) };
    const auth = { accountId: 'account-id', activeMembershipId: 'membership-id', tenantId: 'tenant-id' };
    const guard = new AuthorizationGuard(reflector as never, service as never);
    await expect(guard.canActivate(executionContext(auth))).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.hasPermissions).toHaveBeenCalledWith({ tenantId: 'tenant-id', accountId: 'account-id', membershipId: 'membership-id' }, ['attendance.read', 'attendance.record'], undefined);
  });

  it('denies handlers without permission metadata and empty permission lists', async () => {
    const auth = { accountId: 'account-id', activeMembershipId: 'membership-id', tenantId: 'tenant-id' };
    const service = { hasPermissions: vi.fn().mockResolvedValue(true) };
    const missing = new AuthorizationGuard({ getAllAndOverride: vi.fn().mockReturnValue(undefined) } as never, service as never);
    const empty = new AuthorizationGuard({ getAllAndOverride: vi.fn().mockReturnValue([]) } as never, service as never);
    await expect(missing.canActivate(executionContext(auth))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(empty.canActivate(executionContext(auth))).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.hasPermissions).not.toHaveBeenCalled();
  });

  it('passes only the server-resolved target scope into permission evaluation', async () => {
    const scope = { kind: 'campus', schoolId: 'school-id', campusId: 'campus-id' } as const;
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(['attendance.read']) };
    const service = { hasPermissions: vi.fn().mockResolvedValue(true) };
    const auth = { accountId: 'account-id', activeMembershipId: 'membership-id', tenantId: 'tenant-id' };
    const guard = new AuthorizationGuard(reflector as never, service as never);
    const ctx = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ auth, authorizationTargetScope: scope }) }),
    } as never;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(service.hasPermissions).toHaveBeenCalledWith(
      { tenantId: 'tenant-id', accountId: 'account-id', membershipId: 'membership-id' },
      ['attendance.read'], scope,
    );
  });
});

