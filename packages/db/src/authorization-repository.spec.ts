import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { seedTenantAuthorization } from './authorization-seeding.js';
import {
  assignRole, canAccessScope, createCustomRole, listMembershipAuthorizationGrants,
  isAuthorizationScopeInTenant, listTenantAuthorizationAssignments, revokeRoleAssignment, AuthorizationRepositoryError,
} from './authorization-repository.js';
import { withTenantContext } from './tenant-context.js';
import {
  authorizationRolePermissions, authorizationRoles, campuses, memberships, membershipRoleAssignments,
  securityEvents,
} from './schema.js';

const adminUrl = process.env.DATABASE_PROVISIONER_URL;
const runtimeUrl = process.env.DATABASE_URL;

describe('canAccessScope', () => {
  const tenant: AuthorizationScope = { kind: 'tenant' };
  const school: AuthorizationScope = { kind: 'school', schoolId: 'school-a' };
  const campusA: AuthorizationScope = { kind: 'campus', schoolId: 'school-a', campusId: 'campus-a' };
  const campusB: AuthorizationScope = { kind: 'campus', schoolId: 'school-a', campusId: 'campus-b' };
  const otherSchoolCampus: AuthorizationScope = { kind: 'campus', schoolId: 'school-b', campusId: 'campus-c' };
  const grant = (scope: AuthorizationScope, permissionKey = 'attendance.read'): AuthorizationGrant => ({ permissionKey, scope });

  it('inherits tenant grants to tenant, school, and campus scopes', () => {
    expect(canAccessScope([grant(tenant)], 'attendance.read', tenant)).toBe(true);
    expect(canAccessScope([grant(tenant)], 'attendance.read', school)).toBe(true);
    expect(canAccessScope([grant(tenant)], 'attendance.read', campusA)).toBe(true);
  });
  it('inherits school grants to campuses in that school only', () => {
    expect(canAccessScope([grant(school)], 'attendance.read', campusA)).toBe(true);
    expect(canAccessScope([grant(school)], 'attendance.read', otherSchoolCampus)).toBe(false);
    expect(canAccessScope([grant(school)], 'attendance.read', tenant)).toBe(false);
  });
  it('limits campus grants to the exact campus and denies unknown permissions', () => {
    expect(canAccessScope([grant(campusA)], 'attendance.read', campusA)).toBe(true);
    expect(canAccessScope([grant(campusA)], 'attendance.read', campusB)).toBe(false);
    expect(canAccessScope([grant(tenant)], 'unknown.permission', campusA)).toBe(false);
  });
  it('fails closed for unsupported academic or relationship scopes', () => {
    const unsupported = { kind: 'student' } as unknown as AuthorizationScope;
    expect(canAccessScope([grant(tenant)], 'marks.read', unsupported)).toBe(false);
  });
});

type AuthorizationScope = import('./authorization-repository.js').AuthorizationScope;
type AuthorizationGrant = import('./authorization-repository.js').AuthorizationGrant;

describe.skipIf(!adminUrl || !runtimeUrl)('authorization repository PostgreSQL boundaries', () => {
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  const tenantIds: string[] = [];
  const accountIds: string[] = [];

  beforeAll(() => {
    admin = postgres(adminUrl!, { max: 4 });
    runtime = createDb(runtimeUrl!, { maxConnections: 4 });
  });
  afterAll(async () => {
    if (tenantIds.length) await admin`delete from tenants where id::text = any(${admin.array(tenantIds)})`;
    if (accountIds.length) await admin`delete from accounts where id::text = any(${admin.array(accountIds)})`;
    await runtime.close();
    await admin.end();
  });

  async function makeTenant() {
    const suffix = randomUUID();
    const tenantId = randomUUID();
    const schoolId = randomUUID();
    const campusId = randomUUID();
    tenantIds.push(tenantId);
    await admin`insert into tenants (id, name, slug) values (${tenantId}, ${`Authz ${suffix}`}, ${`authz-${suffix}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Main School', ${`A${suffix.slice(0, 8)}`}, 'UTC', 'USD')`;
    await withTenantContext(runtime.db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    await withTenantContext(runtime.db, tenantId, (tx) => tx.insert(campuses).values({
      id: campusId, tenantId, schoolId, name: 'North Campus', code: 'NORTH',
    }));
    return { tenantId, schoolId, campusId };
  }

  async function makeMember(tenantId: string) {
    const accountId = randomUUID();
    accountIds.push(accountId);
    await admin`insert into accounts (id, normalized_email, display_name) values (${accountId}, ${`${accountId}@example.test`}, 'Authz test')`;
    const [membership] = await withTenantContext(runtime.db, tenantId, (tx) => tx.insert(memberships).values({
      tenantId, accountId,
    }).returning());
    return { accountId, membershipId: membership!.id };
  }

  async function systemRole(tenantId: string, key: string) {
    const [role] = await withTenantContext(runtime.db, tenantId, (tx) => tx.select({ id: authorizationRoles.id })
      .from(authorizationRoles).where(and(eq(authorizationRoles.tenantId, tenantId), eq(authorizationRoles.systemKey, key))).limit(1));
    return role!.id;
  }

  it('unions active role grants, scopes them, and clears tenant context on pooled connections', async () => {
    const tenant = await makeTenant();
    const actor = await makeMember(tenant.tenantId);
    const target = await makeMember(tenant.tenantId);
    const adminRoleId = await systemRole(tenant.tenantId, 'tenant_admin');
    const teacherRoleId = await systemRole(tenant.tenantId, 'teacher');
    const adminAssignment = await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenant.tenantId, membershipId: actor.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }).returning());
    await withTenantContext(runtime.db, tenant.tenantId, (tx) => assignRole(tx, {
      tenantId: tenant.tenantId, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId,
      membershipId: target.membershipId, roleId: teacherRoleId,
      scope: { kind: 'campus', schoolId: tenant.schoolId, campusId: tenant.campusId },
    }));
    const grants = await listMembershipAuthorizationGrants(runtime.db, {
      tenantId: tenant.tenantId, accountId: target.accountId, membershipId: target.membershipId,
    });
    expect(canAccessScope(grants, 'attendance.read', { kind: 'tenant' })).toBe(false);
    expect(canAccessScope(grants, 'attendance.record', { kind: 'campus', schoolId: tenant.schoolId, campusId: tenant.campusId })).toBe(true);
    expect(canAccessScope(grants, 'attendance.record', { kind: 'campus', schoolId: tenant.schoolId, campusId: randomUUID() })).toBe(false);

    const noContext = await runtime.db.select().from(membershipRoleAssignments);
    expect(noContext).toEqual([]);
    const nextTenant = await makeTenant();
    const noLeak = await withTenantContext(runtime.db, nextTenant.tenantId, (tx) => tx.select().from(membershipRoleAssignments));
    expect(noLeak).toEqual([]);
    expect(adminAssignment).toHaveLength(1);
  });

  it('rejects foreign tenant identifiers, unsupported permission ceilings, and invalid scopes', async () => {
    const tenantA = await makeTenant();
    const tenantB = await makeTenant();
    const actor = await makeMember(tenantA.tenantId);
    const foreignMember = await makeMember(tenantB.tenantId);
    const auditorId = await systemRole(tenantA.tenantId, 'auditor');
    await withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: actor.membershipId, roleId: auditorId, scopeKind: 'tenant',
    }));
    const teacherId = await systemRole(tenantA.tenantId, 'teacher');
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => assignRole(tx, {
      tenantId: tenantA.tenantId, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId,
      membershipId: foreignMember.membershipId, roleId: teacherId, scope: { kind: 'tenant' },
    }))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => createCustomRole(tx, {
      tenantId: tenantA.tenantId, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId,
      key: 'too-powerful', name: 'Too powerful', permissionKeys: ['authorization.roles.manage'],
    }))).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const admin = await makeMember(tenantA.tenantId);
    const adminRoleId = await systemRole(tenantA.tenantId, 'tenant_admin');
    await withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: admin.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }));
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => assignRole(tx, {
      tenantId: tenantA.tenantId, actorAccountId: admin.accountId, actorMembershipId: admin.membershipId,
      membershipId: foreignMember.membershipId, roleId: teacherId, scope: { kind: 'tenant' },
    }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => assignRole(tx, {
      tenantId: tenantA.tenantId, actorAccountId: admin.accountId, actorMembershipId: admin.membershipId,
      membershipId: admin.membershipId, roleId: teacherId,
      scope: { kind: 'school', schoolId: tenantB.schoolId },
    }))).rejects.toMatchObject({ code: 'INVALID_SCOPE' });

    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: admin.membershipId, roleId: teacherId,
      scopeKind: 'campus', schoolId: tenantA.schoolId, campusId: randomUUID(),
    }))).rejects.toThrow();

    const foreignAdminRoleId = await systemRole(tenantB.tenantId, 'tenant_admin');
    const permissionKey = 'attendance.read';
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: foreignMember.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: admin.membershipId, roleId: foreignAdminRoleId, scopeKind: 'tenant',
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: admin.membershipId, roleId: adminRoleId,
      scopeKind: 'school', schoolId: tenantB.schoolId,
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenantA.tenantId, membershipId: admin.membershipId, roleId: adminRoleId,
      scopeKind: 'campus', schoolId: tenantA.schoolId, campusId: tenantB.campusId,
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, tenantA.tenantId, (tx) => tx.insert(authorizationRolePermissions).values({
      tenantId: tenantA.tenantId, roleId: foreignAdminRoleId, permissionKey,
    }))).rejects.toThrow();
  });

  it('enforces the real permission ceiling and records recoverable assignments', async () => {
    const tenant = await makeTenant();
    const adminActor = await makeMember(tenant.tenantId);
    const manager = await makeMember(tenant.tenantId);
    const target = await makeMember(tenant.tenantId);
    const tenantAdminRoleId = await systemRole(tenant.tenantId, 'tenant_admin');
    await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenant.tenantId, membershipId: adminActor.membershipId, roleId: tenantAdminRoleId, scopeKind: 'tenant',
    }));
    const limitedManagerRole = await withTenantContext(runtime.db, tenant.tenantId, (tx) => createCustomRole(tx, {
      tenantId: tenant.tenantId, actorAccountId: adminActor.accountId, actorMembershipId: adminActor.membershipId,
      key: 'limited_role_manager', name: 'Limited role manager',
      permissionKeys: ['authorization.roles.manage', 'attendance.read'], requestId: 'req-role-create',
    }));
    await withTenantContext(runtime.db, tenant.tenantId, (tx) => assignRole(tx, {
      tenantId: tenant.tenantId, actorAccountId: adminActor.accountId, actorMembershipId: adminActor.membershipId,
      membershipId: manager.membershipId, roleId: limitedManagerRole.id, scope: { kind: 'tenant' }, requestId: 'req-manager-assignment',
    }));
    const teacherRoleId = await systemRole(tenant.tenantId, 'teacher');
    await expect(withTenantContext(runtime.db, tenant.tenantId, (tx) => assignRole(tx, {
      tenantId: tenant.tenantId, actorAccountId: manager.accountId, actorMembershipId: manager.membershipId,
      membershipId: target.membershipId, roleId: teacherRoleId, scope: { kind: 'tenant' },
    }))).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const assignment = await withTenantContext(runtime.db, tenant.tenantId, (tx) => assignRole(tx, {
      tenantId: tenant.tenantId, actorAccountId: adminActor.accountId, actorMembershipId: adminActor.membershipId,
      membershipId: target.membershipId, roleId: teacherRoleId,
      scope: { kind: 'campus', schoolId: tenant.schoolId, campusId: tenant.campusId }, requestId: 'req-teacher-assignment',
    }));
    expect(assignment).toBeDefined();
    const listed = await listTenantAuthorizationAssignments(runtime.db, tenant.tenantId);
    expect(listed).toEqual(expect.arrayContaining([expect.objectContaining({
      id: assignment!.id, membershipId: target.membershipId, roleId: teacherRoleId,
      scopeKind: 'campus', schoolId: tenant.schoolId, campusId: tenant.campusId,
      permissionKeys: expect.arrayContaining(['attendance.read', 'marks.enter']),
    })]));

    await withTenantContext(runtime.db, tenant.tenantId, (tx) => revokeRoleAssignment(tx, {
      tenantId: tenant.tenantId, assignmentId: assignment!.id, actorAccountId: adminActor.accountId, requestId: 'req-teacher-revoke',
    }));
    const events = await admin<{ eventType: string; requestId: string | null; metadata: Record<string, unknown> }[]>`
      select event_type as "eventType", request_id as "requestId", metadata
      from security_events where tenant_id = ${tenant.tenantId}
      order by created_at, id
    `;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'authorization_role_created', requestId: 'req-role-create', metadata: expect.objectContaining({ afterPermissionKeys: 'attendance.read,authorization.roles.manage' }) }),
      expect.objectContaining({ eventType: 'authorization_role_assigned', requestId: 'req-teacher-assignment', metadata: expect.objectContaining({
        schoolId: tenant.schoolId, campusId: tenant.campusId, permissionKeys: expect.stringContaining('marks.enter'),
        beforeScopeKind: '', afterScopeKind: 'campus', afterSchoolId: tenant.schoolId, afterCampusId: tenant.campusId,
      }) }),
      expect.objectContaining({ eventType: 'authorization_role_revoked', requestId: 'req-teacher-revoke', metadata: expect.objectContaining({
        schoolId: tenant.schoolId, campusId: tenant.campusId, permissionKeys: expect.stringContaining('marks.enter'),
        beforeScopeKind: 'campus', beforeSchoolId: tenant.schoolId, beforeCampusId: tenant.campusId, afterScopeKind: '',
      }) }),
    ]));
  });

  it('resolves only current resources from the active tenant', async () => {
    const tenantA = await makeTenant();
    const tenantB = await makeTenant();
    expect(await isAuthorizationScopeInTenant(runtime.db, tenantA.tenantId, { kind: 'school', schoolId: tenantA.schoolId })).toBe(true);
    expect(await isAuthorizationScopeInTenant(runtime.db, tenantA.tenantId, { kind: 'campus', schoolId: tenantA.schoolId, campusId: tenantA.campusId })).toBe(true);
    expect(await isAuthorizationScopeInTenant(runtime.db, tenantA.tenantId, { kind: 'school', schoolId: tenantB.schoolId })).toBe(false);
    expect(await isAuthorizationScopeInTenant(runtime.db, tenantA.tenantId, { kind: 'campus', schoolId: tenantA.schoolId, campusId: tenantB.campusId })).toBe(false);
    await admin`delete from schools where id = ${tenantA.schoolId}`;
    expect(await isAuthorizationScopeInTenant(runtime.db, tenantA.tenantId, { kind: 'school', schoolId: tenantA.schoolId })).toBe(false);
  });

  it('does not count a disabled account as the final active tenant administrator', async () => {
    const tenant = await makeTenant();
    const usableAdmin = await makeMember(tenant.tenantId);
    const disabledAdmin = await makeMember(tenant.tenantId);
    const adminRoleId = await systemRole(tenant.tenantId, 'tenant_admin');
    const [usableAssignment] = await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenant.tenantId, membershipId: usableAdmin.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }).returning());
    await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenant.tenantId, membershipId: disabledAdmin.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }));
    await admin`update accounts set status = 'disabled' where id = ${disabledAdmin.accountId}`;

    await expect(withTenantContext(runtime.db, tenant.tenantId, (tx) => revokeRoleAssignment(tx, {
      tenantId: tenant.tenantId, assignmentId: usableAssignment!.id, actorAccountId: usableAdmin.accountId,
    }))).rejects.toMatchObject({ code: 'LAST_TENANT_ADMIN' });
    const grants = await listMembershipAuthorizationGrants(runtime.db, {
      tenantId: tenant.tenantId, accountId: disabledAdmin.accountId, membershipId: disabledAdmin.membershipId,
    });
    expect(grants).toEqual([]);
  });

  it('rolls back audit and role changes together and serializes final administrator revocations', async () => {
    const tenant = await makeTenant();
    const first = await makeMember(tenant.tenantId);
    const second = await makeMember(tenant.tenantId);
    const adminRoleId = await systemRole(tenant.tenantId, 'tenant_admin');
    const [firstAssignment] = await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenant.tenantId, membershipId: first.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }).returning());
    const [secondAssignment] = await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.insert(membershipRoleAssignments).values({
      tenantId: tenant.tenantId, membershipId: second.membershipId, roleId: adminRoleId, scopeKind: 'tenant',
    }).returning());

    await expect(withTenantContext(runtime.db, tenant.tenantId, async (tx) => {
      await createCustomRole(tx, {
        tenantId: tenant.tenantId, actorAccountId: first.accountId, actorMembershipId: first.membershipId,
        key: 'rolled-back', name: 'Rolled back', permissionKeys: ['attendance.read'],
      });
      throw new Error('force transaction rollback');
    })).rejects.toThrow('force transaction rollback');
    const rolledBackRoles = await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.select().from(authorizationRoles)
      .where(eq(authorizationRoles.key, 'rolled-back')));
    const rolledBackAudits = await admin<{ id: string }[]>`select id from security_events where tenant_id = ${tenant.tenantId}`;
    expect(rolledBackRoles).toHaveLength(0);
    expect(rolledBackAudits).toHaveLength(0);

    const results = await Promise.allSettled([
      withTenantContext(runtime.db, tenant.tenantId, (tx) => revokeRoleAssignment(tx, {
        tenantId: tenant.tenantId, assignmentId: firstAssignment!.id, actorAccountId: first.accountId,
      })),
      withTenantContext(runtime.db, tenant.tenantId, (tx) => revokeRoleAssignment(tx, {
        tenantId: tenant.tenantId, assignmentId: secondAssignment!.id, actorAccountId: second.accountId,
      })),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected' && result.reason instanceof AuthorizationRepositoryError && result.reason.code === 'LAST_TENANT_ADMIN')).toHaveLength(1);
    const remaining = await withTenantContext(runtime.db, tenant.tenantId, (tx) => tx.select().from(membershipRoleAssignments));
    expect(remaining).toHaveLength(1);
  });
});





