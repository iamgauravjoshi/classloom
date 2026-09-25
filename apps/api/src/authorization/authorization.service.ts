import { Inject, Injectable } from '@nestjs/common';
import { canAccessScope, PERMISSION_CATALOG } from '@classloom/db';
import type { AuthorizationGrant, AuthorizationScope, PermissionKey } from '@classloom/db';

export const AUTHORIZATION_GRANT_READER = Symbol('AUTHORIZATION_GRANT_READER');

export interface AuthorizationContext {
  tenantId: string | null | undefined;
  accountId: string | null | undefined;
  membershipId: string | null | undefined;
}

export interface AuthorizationGrantReader {
  listMembershipAuthorizationGrants(context: { tenantId: string; accountId: string; membershipId: string }): Promise<AuthorizationGrant[]>;
  isScopeInTenant(context: { tenantId: string }, scope: AuthorizationScope): Promise<boolean>;
}

const permissionsByKey = new Map(PERMISSION_CATALOG.map((permission) => [permission.key, permission]));

@Injectable()
export class AuthorizationService {
  constructor(@Inject(AUTHORIZATION_GRANT_READER) private readonly grantReader: AuthorizationGrantReader) {}

  async hasPermissions(
    context: AuthorizationContext,
    requiredKeys: readonly PermissionKey[],
    targetScope?: AuthorizationScope,
  ): Promise<boolean> {
    if (!context.tenantId || !context.accountId || !context.membershipId || requiredKeys.length === 0) return false;
    const permissionDefinitions = requiredKeys.map((key) => permissionsByKey.get(key));
    if (permissionDefinitions.some((permission) => !permission)) return false;
    const scope = targetScope ?? { kind: 'tenant' as const };
    if (permissionDefinitions.some((permission) => {
      if (!permission || ['academic', 'relationship'].includes(String(permission.scopeKind))) return true;
      const targetDepth = scope.kind === 'tenant' ? 0 : scope.kind === 'school' ? 1 : scope.kind === 'campus' ? 2 : -1;
      const requiredDepth = permission.scopeKind === 'tenant' ? 0 : permission.scopeKind === 'school' ? 1 : 2;
      return targetDepth < requiredDepth;
    })) return false;
    try {
      if (scope.kind !== 'tenant' && !await this.grantReader.isScopeInTenant({ tenantId: context.tenantId }, scope)) return false;
      const grants = await this.grantReader.listMembershipAuthorizationGrants({
        tenantId: context.tenantId,
        accountId: context.accountId,
        membershipId: context.membershipId,
      });
      return requiredKeys.every((key) => canAccessScope(grants, key, scope));
    } catch {
      return false;
    }
  }
}

