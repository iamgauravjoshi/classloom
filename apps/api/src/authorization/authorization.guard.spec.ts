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
    expect(service.hasPermissions).toHaveBeenCalledWith({ tenantId: 'tenant-id', accountId: 'account-id', membershipId: 'membership-id' }, ['attendance.read', 'attendance.record']);
  });
});

