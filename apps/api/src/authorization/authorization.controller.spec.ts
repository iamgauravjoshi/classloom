import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuthorizationController } from './authorization.controller.js';

const request = { auth: { accountId: 'account-id', activeMembershipId: 'membership-id', tenantId: 'tenant-id' } } as never;

describe('AuthorizationController input boundaries', () => {
  const controller = new AuthorizationController({} as never);

  it('rejects client-selected tenant IDs on catalog reads', () => {
    expect(() => controller.listPermissions(request, { tenantId: 'foreign-tenant' })).toThrow(BadRequestException);
    expect(() => controller.listRoles(request, { tenantId: 'foreign-tenant' })).toThrow(BadRequestException);
  });

  it('rejects tenant IDs in role mutation bodies before database access', async () => {
    await expect(controller.createRole(request, {
      tenantId: 'foreign-tenant', key: 'custom', name: 'Custom', permissionKeys: ['attendance.read'],
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
