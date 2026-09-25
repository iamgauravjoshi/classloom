import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AppDb, TenantTransaction } from './client.js';
import { PERMISSION_CATALOG, type PermissionKey } from './authorization-catalog.js';
import { withTenantContext } from './tenant-context.js';
import {
  accounts,
  authorizationRolePermissions,
  authorizationRoles,
  campuses,
  memberships,
  membershipRoleAssignments,
  schools,
  securityEvents,
} from './schema.js';

export type AuthorizationScope =
  | { kind: 'tenant' }
  | { kind: 'school'; schoolId: string }
  | { kind: 'campus'; schoolId: string; campusId: string };

export type AuthorizationGrant = { permissionKey: string; scope: AuthorizationScope };

export class AuthorizationRepositoryError extends Error {
  constructor(message: string, readonly code: 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_SCOPE' | 'LAST_TENANT_ADMIN') {
    super(message);
    this.name = 'AuthorizationRepositoryError';
  }
}

const catalogKeys = new Set<string>(PERMISSION_CATALOG.map(({ key }) => key));

function isSupportedScope(scope: unknown): scope is AuthorizationScope {
  if (!scope || typeof scope !== 'object') return false;
  const value = scope as Record<string, unknown>;
  if (value.kind === 'tenant') return true;
  if (value.kind === 'school') return typeof value.schoolId === 'string';
  return value.kind === 'campus' && typeof value.schoolId === 'string' && typeof value.campusId === 'string';
}

export function canAccessScope(
  grants: readonly AuthorizationGrant[],
  permissionKey: string,
  targetScope: AuthorizationScope,
): boolean {
  if (!catalogKeys.has(permissionKey) || !isSupportedScope(targetScope)) return false;
  return grants.some(({ permissionKey: key, scope }) => {
    if (key !== permissionKey || !isSupportedScope(scope)) return false;
    if (scope.kind === 'tenant') return true;
    if (targetScope.kind === 'tenant') return false;
    if (scope.kind === 'school') return targetScope.schoolId === scope.schoolId;
    return targetScope.kind === 'campus'
      && targetScope.schoolId === scope.schoolId
      && targetScope.campusId === scope.campusId;
  });
}

function rowScope(row: { scopeKind: string; schoolId: string | null; campusId: string | null }): AuthorizationScope | undefined {
  if (row.scopeKind === 'tenant' && !row.schoolId && !row.campusId) return { kind: 'tenant' };
  if (row.scopeKind === 'school' && row.schoolId && !row.campusId) return { kind: 'school', schoolId: row.schoolId };
  if (row.scopeKind === 'campus' && row.schoolId && row.campusId) {
    return { kind: 'campus', schoolId: row.schoolId, campusId: row.campusId };
  }
  return undefined;
}

async function grantsForMembership(tx: TenantTransaction, tenantId: string, accountId: string, membershipId: string) {
  const rows = await tx.select({
    permissionKey: authorizationRolePermissions.permissionKey,
    scopeKind: membershipRoleAssignments.scopeKind,
    schoolId: membershipRoleAssignments.schoolId,
    campusId: membershipRoleAssignments.campusId,
  })
    .from(membershipRoleAssignments)
    .innerJoin(memberships, and(
      eq(memberships.id, membershipRoleAssignments.membershipId),
      eq(memberships.tenantId, membershipRoleAssignments.tenantId),
    ))
    .innerJoin(authorizationRoles, and(
      eq(authorizationRoles.id, membershipRoleAssignments.roleId),
      eq(authorizationRoles.tenantId, membershipRoleAssignments.tenantId),
    ))
    .innerJoin(authorizationRolePermissions, and(
      eq(authorizationRolePermissions.roleId, authorizationRoles.id),
      eq(authorizationRolePermissions.tenantId, authorizationRoles.tenantId),
    ))
    .where(and(
      eq(membershipRoleAssignments.tenantId, tenantId),
      eq(membershipRoleAssignments.membershipId, membershipId),
      eq(memberships.accountId, accountId),
      eq(memberships.status, 'active'),
    ));
  return rows.flatMap((row) => {
    const scope = rowScope(row);
    return scope ? [{ permissionKey: row.permissionKey, scope }] : [];
  });
}

export async function listMembershipAuthorizationGrants(
  db: AppDb,
  input: { tenantId: string; accountId: string; membershipId: string },
): Promise<AuthorizationGrant[]> {
  return withTenantContext(db, input.tenantId, async (tx) => grantsForMembership(
    tx, input.tenantId, input.accountId, input.membershipId,
  ));
}

function requireKnownPermissions(keys: readonly string[]): asserts keys is readonly PermissionKey[] {
  if (keys.some((key) => !catalogKeys.has(key))) {
    throw new AuthorizationRepositoryError('Unknown permission key', 'FORBIDDEN');
  }
}

async function requireActiveActor(
  tx: TenantTransaction,
  tenantId: string,
  actorAccountId: string,
  actorMembershipId: string,
) {
  const [actor] = await tx.select({ id: memberships.id }).from(memberships).where(and(
    eq(memberships.id, actorMembershipId),
    eq(memberships.tenantId, tenantId),
    eq(memberships.accountId, actorAccountId),
    eq(memberships.status, 'active'),
  )).limit(1);
  if (!actor) throw new AuthorizationRepositoryError('Active actor membership not found', 'FORBIDDEN');
}

async function assertActorCan(
  tx: TenantTransaction,
  input: { tenantId: string; actorAccountId: string; actorMembershipId: string },
  permissionKey: string,
  targetScope: AuthorizationScope,
) {
  await requireActiveActor(tx, input.tenantId, input.actorAccountId, input.actorMembershipId);
  const grants = await grantsForMembership(tx, input.tenantId, input.actorAccountId, input.actorMembershipId);
  if (!canAccessScope(grants, permissionKey, targetScope)) {
    throw new AuthorizationRepositoryError('Actor lacks required permission at target scope', 'FORBIDDEN');
  }
  return grants;
}

function scopeColumns(scope: AuthorizationScope) {
  if (!isSupportedScope(scope)) throw new AuthorizationRepositoryError('Unsupported authorization scope', 'INVALID_SCOPE');
  return {
    scopeKind: scope.kind,
    schoolId: scope.kind === 'tenant' ? null : scope.schoolId,
    campusId: scope.kind === 'campus' ? scope.campusId : null,
  };
}

async function validateScope(tx: TenantTransaction, tenantId: string, scope: AuthorizationScope) {
  if (!isSupportedScope(scope)) throw new AuthorizationRepositoryError('Unsupported authorization scope', 'INVALID_SCOPE');
  if (scope.kind === 'tenant') return;
  const [school] = await tx.select({ id: schools.id }).from(schools).where(and(
    eq(schools.tenantId, tenantId), eq(schools.id, scope.schoolId),
  )).limit(1);
  if (!school) throw new AuthorizationRepositoryError('School not found in tenant', 'INVALID_SCOPE');
  if (scope.kind === 'campus') {
    const [campus] = await tx.select({ id: campuses.id }).from(campuses).where(and(
      eq(campuses.tenantId, tenantId), eq(campuses.schoolId, scope.schoolId), eq(campuses.id, scope.campusId),
    )).limit(1);
    if (!campus) throw new AuthorizationRepositoryError('Campus not found under school in tenant', 'INVALID_SCOPE');
  }
}

export async function createCustomRole(
  tx: TenantTransaction,
  input: {
    tenantId: string; actorAccountId: string; actorMembershipId: string;
    key: string; name: string; permissionKeys: readonly string[];
  },
) {
  requireKnownPermissions(input.permissionKeys);
  await assertActorCan(tx, input, 'authorization.roles.manage', { kind: 'tenant' });
  for (const key of input.permissionKeys) {
    const grants = await grantsForMembership(tx, input.tenantId, input.actorAccountId, input.actorMembershipId);
    if (!canAccessScope(grants, key, { kind: 'tenant' })) {
      throw new AuthorizationRepositoryError(`Actor cannot grant ${key} at tenant scope`, 'FORBIDDEN');
    }
  }
  const [role] = await tx.insert(authorizationRoles).values({
    tenantId: input.tenantId, key: input.key, name: input.name, systemKey: null,
  }).returning();
  if (!role) throw new Error('Custom role insert did not return a row');
  if (input.permissionKeys.length) {
    await tx.insert(authorizationRolePermissions).values(input.permissionKeys.map((permissionKey) => ({
      tenantId: input.tenantId, roleId: role.id, permissionKey,
    })));
  }
  await tx.insert(securityEvents).values({
    eventType: 'authorization_role_created', accountId: input.actorAccountId, tenantId: input.tenantId,
    metadata: { roleId: role.id, roleKey: role.key, permissionCount: input.permissionKeys.length },
  });
  return role;
}

export async function assignRole(
  tx: TenantTransaction,
  input: {
    tenantId: string; actorAccountId: string; actorMembershipId: string;
    membershipId: string; roleId: string; scope: AuthorizationScope;
  },
) {
  const targetScope = input.scope;
  const managerGrants = await assertActorCan(tx, input, 'authorization.roles.manage', targetScope);
  await validateScope(tx, input.tenantId, targetScope);
  const [membership] = await tx.select({ id: memberships.id }).from(memberships).where(and(
    eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId), eq(memberships.status, 'active'),
  )).limit(1);
  if (!membership) throw new AuthorizationRepositoryError('Active target membership not found', 'NOT_FOUND');
  const [role] = await tx.select({ id: authorizationRoles.id }).from(authorizationRoles).where(and(
    eq(authorizationRoles.id, input.roleId), eq(authorizationRoles.tenantId, input.tenantId),
  )).limit(1);
  if (!role) throw new AuthorizationRepositoryError('Role not found in tenant', 'NOT_FOUND');
  const rolePermissions = await tx.select({ permissionKey: authorizationRolePermissions.permissionKey })
    .from(authorizationRolePermissions).where(and(
      eq(authorizationRolePermissions.tenantId, input.tenantId), eq(authorizationRolePermissions.roleId, role.id),
    ));
  for (const { permissionKey } of rolePermissions) {
    if (!canAccessScope(managerGrants, permissionKey, targetScope)) {
      throw new AuthorizationRepositoryError('Role exceeds actor permission ceiling at target scope', 'FORBIDDEN');
    }
  }
  const [assignment] = await tx.insert(membershipRoleAssignments).values({
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    roleId: input.roleId,
    ...scopeColumns(targetScope),
    createdByAccountId: input.actorAccountId,
  }).onConflictDoNothing().returning();
  if (assignment) {
    await tx.insert(securityEvents).values({
      eventType: 'authorization_role_assigned', accountId: input.actorAccountId, tenantId: input.tenantId,
      metadata: { assignmentId: assignment.id, membershipId: assignment.membershipId, roleId: assignment.roleId, scopeKind: assignment.scopeKind },
    });
  }
  return assignment;
}

export async function revokeRoleAssignment(
  tx: TenantTransaction,
  input: { tenantId: string; assignmentId: string; actorAccountId: string },
) {
  const [existing] = await tx.select({
    id: membershipRoleAssignments.id,
    membershipId: membershipRoleAssignments.membershipId,
    roleId: membershipRoleAssignments.roleId,
    scopeKind: membershipRoleAssignments.scopeKind,
    schoolId: membershipRoleAssignments.schoolId,
    campusId: membershipRoleAssignments.campusId,
  }).from(membershipRoleAssignments).where(and(
    eq(membershipRoleAssignments.id, input.assignmentId), eq(membershipRoleAssignments.tenantId, input.tenantId),
  )).limit(1);
  if (!existing) throw new AuthorizationRepositoryError('Role assignment not found', 'NOT_FOUND');

  if (existing.scopeKind === 'tenant') {
    const [role] = await tx.select({ systemKey: authorizationRoles.systemKey }).from(authorizationRoles).where(and(
      eq(authorizationRoles.id, existing.roleId), eq(authorizationRoles.tenantId, input.tenantId),
    )).limit(1);
    if (role?.systemKey === 'tenant_admin') {
      await tx.execute(sql`
        select assignment.id
        from membership_role_assignments assignment
        join authorization_roles role on role.tenant_id = assignment.tenant_id and role.id = assignment.role_id
        join memberships member on member.tenant_id = assignment.tenant_id and member.id = assignment.membership_id
        where assignment.tenant_id = ${input.tenantId}
          and assignment.scope_kind = 'tenant'
          and role.system_key = 'tenant_admin'
          and member.status = 'active'
        order by assignment.id
        for update of assignment
      `);
    }
  }

  const [removed] = await tx.delete(membershipRoleAssignments).where(and(
    eq(membershipRoleAssignments.id, input.assignmentId), eq(membershipRoleAssignments.tenantId, input.tenantId),
  )).returning();
  if (!removed) throw new AuthorizationRepositoryError('Role assignment not found', 'NOT_FOUND');
  if (removed.scopeKind === 'tenant') {
    const [role] = await tx.select({ systemKey: authorizationRoles.systemKey }).from(authorizationRoles).where(and(
      eq(authorizationRoles.id, removed.roleId), eq(authorizationRoles.tenantId, input.tenantId),
    )).limit(1);
    if (role?.systemKey === 'tenant_admin') {
      const remaining = await tx.select({ id: membershipRoleAssignments.id })
        .from(membershipRoleAssignments)
        .innerJoin(authorizationRoles, and(
          eq(authorizationRoles.id, membershipRoleAssignments.roleId),
          eq(authorizationRoles.tenantId, membershipRoleAssignments.tenantId),
        ))
        .innerJoin(memberships, and(
          eq(memberships.id, membershipRoleAssignments.membershipId),
          eq(memberships.tenantId, membershipRoleAssignments.tenantId),
        ))
        .where(and(
          eq(membershipRoleAssignments.tenantId, input.tenantId),
          eq(membershipRoleAssignments.scopeKind, 'tenant'),
          eq(authorizationRoles.systemKey, 'tenant_admin'),
          eq(memberships.status, 'active'),
        ));
      if (remaining.length === 0) {
        throw new AuthorizationRepositoryError('Cannot remove the final active tenant administrator', 'LAST_TENANT_ADMIN');
      }
    }
  }
  await tx.insert(securityEvents).values({
    eventType: 'authorization_role_revoked', accountId: input.actorAccountId, tenantId: input.tenantId,
    metadata: { assignmentId: removed.id, membershipId: removed.membershipId, roleId: removed.roleId, scopeKind: removed.scopeKind },
  });
  return removed;
}


export async function listTenantAuthorizationRoles(db: AppDb, tenantId: string) {
  return withTenantContext(db, tenantId, async (tx) => {
    const roles = await tx.select().from(authorizationRoles).where(eq(authorizationRoles.tenantId, tenantId));
    if (!roles.length) return [];
    const permissions = await tx.select({ roleId: authorizationRolePermissions.roleId, permissionKey: authorizationRolePermissions.permissionKey })
      .from(authorizationRolePermissions)
      .where(and(eq(authorizationRolePermissions.tenantId, tenantId), inArray(authorizationRolePermissions.roleId, roles.map(({ id }) => id))));
    const grouped = new Map<string, string[]>();
    for (const permission of permissions) {
      const keys = grouped.get(permission.roleId) ?? [];
      keys.push(permission.permissionKey);
      grouped.set(permission.roleId, keys);
    }
    return roles.map((role) => ({ ...role, permissionKeys: (grouped.get(role.id) ?? []).sort() }));
  });
}

export async function bootstrapTenantAdmin(
  db: AppDb,
  input: { tenantId: string; email: string },
) {
  return withTenantContext(db, input.tenantId, async (tx) => {
    const normalizedEmail = input.email.trim().normalize('NFKC').toLowerCase();
    const [member] = await tx.select({ membershipId: memberships.id, accountId: memberships.accountId })
      .from(memberships)
      .innerJoin(accounts, eq(accounts.id, memberships.accountId))
      .where(and(
        eq(memberships.tenantId, input.tenantId),
        eq(memberships.status, 'active'),
        eq(accounts.normalizedEmail, normalizedEmail),
      )).limit(1);
    if (!member) throw new AuthorizationRepositoryError('Active membership for email not found in tenant', 'NOT_FOUND');
    const [role] = await tx.select({ id: authorizationRoles.id }).from(authorizationRoles).where(and(
      eq(authorizationRoles.tenantId, input.tenantId), eq(authorizationRoles.systemKey, 'tenant_admin'),
    )).limit(1);
    if (!role) throw new AuthorizationRepositoryError('Tenant administrator role is not seeded', 'NOT_FOUND');
    const [assignment] = await tx.insert(membershipRoleAssignments).values({
      tenantId: input.tenantId, membershipId: member.membershipId, roleId: role.id,
      scopeKind: 'tenant', schoolId: null, campusId: null, createdByAccountId: null,
    }).onConflictDoNothing().returning();
    if (assignment) {
      await tx.insert(securityEvents).values({
        eventType: 'tenant_admin_bootstrapped', accountId: null, tenantId: input.tenantId,
        metadata: { membershipId: member.membershipId, roleId: role.id, source: 'trusted_bootstrap_cli' },
      });
    }
    return { membershipId: member.membershipId, assignmentId: assignment?.id ?? null, alreadyAssigned: !assignment };
  });
}


