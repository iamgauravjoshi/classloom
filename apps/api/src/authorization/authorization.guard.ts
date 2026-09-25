import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { PermissionKey } from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { REQUIRED_PERMISSIONS_METADATA } from './authorization.constants.js';
import { AuthorizationService } from './authorization.service.js';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly authorization: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[] | undefined>(REQUIRED_PERMISSIONS_METADATA, [
      context.getHandler(), context.getClass(),
    ]);
    if (required === undefined) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const auth = request.auth;
    if (!auth?.accountId || !auth.activeMembershipId || !auth.tenantId || required.length === 0) {
      throw new ForbiddenException('Permission denied');
    }
    const allowed = await this.authorization.hasPermissions({
      accountId: auth.accountId,
      membershipId: auth.activeMembershipId,
      tenantId: auth.tenantId,
    }, required);
    if (!allowed) throw new ForbiddenException('Permission denied');
    return true;
  }
}
