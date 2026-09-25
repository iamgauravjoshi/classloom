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
}

const knownPermissionKeys = new Set<string>(PERMISSION_CATALOG.map(({ key }) => key));

@Injectable()
export class AuthorizationService {
  constructor(@Inject(AUTHORIZATION_GRANT_READER) private readonly grantReader: AuthorizationGrantReader) {}

  async hasPermissions(
    context: AuthorizationContext,
    requiredKeys: readonly PermissionKey[],
    targetScope?: AuthorizationScope,
  ): Promise<boolean> {
    if (!context.tenantId || !context.accountId || !context.membershipId || requiredKeys.length === 0) return false;
    if (requiredKeys.some((key) => !knownPermissionKeys.has(key))) return false;
    const scope = targetScope ?? { kind: 'tenant' as const };
    try {
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

