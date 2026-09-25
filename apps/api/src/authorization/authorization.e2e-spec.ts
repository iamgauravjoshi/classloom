import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { bootstrapTenantAdmin, createAccountWithMembership, seedTenantAuthorization, withTenantContext } from '@classloom/db';
import request from 'supertest';
import postgresClient from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../database/database.service.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { PasswordService } from '../auth/password.service.js';
import { parseEnv } from '../config/env.js';

const runtimeUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_MIGRATION_URL;
const enabled = Boolean(runtimeUrl && adminUrl);
const headers = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };
const password = 'a secure long passphrase';

describe.skipIf(!enabled)('authorization administration API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgresClient>;
  let tenantId: string;
  let foreignTenantId: string;
  let foreignSchoolId: string;
  let foreignCampusId: string;
  let staleSchoolId: string;
  let memberEmail: string;
  let adminEmail: string;
  let foreignMemberEmail: string;
  let adminMembershipId: string;
  let memberMembershipId: string;
  let foreignMembershipId: string;
  let tenantAdminRoleId: string;
  let foreignRoleId: string;
  let memberCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    admin = postgresClient(adminUrl!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: runtimeUrl!, AUTH_LOGIN_LIMIT: '100' }))
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    const db = app.get(DatabaseService).db;
    const suffix = randomUUID();
    tenantId = randomUUID();
    foreignTenantId = randomUUID();
    memberEmail = `authz-member-${suffix}@example.test`;
    adminEmail = `authz-admin-${suffix}@example.test`;
    foreignMemberEmail = `authz-foreign-member-${suffix}@example.test`;
    foreignSchoolId = randomUUID();
    foreignCampusId = randomUUID();
    staleSchoolId = randomUUID();
    await admin`insert into tenants (id,name,slug) values (${tenantId},'Authz API tenant',${`authz-api-${suffix}`}), (${foreignTenantId},'Foreign tenant',${`authz-foreign-${suffix}`})`;
    await admin`insert into schools (id,tenant_id,name,code,timezone,currency) values (${foreignSchoolId},${foreignTenantId},'Foreign School',${`FS${suffix.slice(0, 6)}`},'UTC','USD')`;
    await admin`insert into campuses (id,tenant_id,school_id,name,code) values (${foreignCampusId},${foreignTenantId},${foreignSchoolId},'Foreign Campus','FOREIGN')`;
    await admin`insert into schools (id,tenant_id,name,code,timezone,currency) values (${staleSchoolId},${tenantId},'Soon Removed School',${`RS${suffix.slice(0, 6)}`},'UTC','USD')`;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    await withTenantContext(db, foreignTenantId, (tx) => seedTenantAuthorization(tx, foreignTenantId));
    const passwordHash = await app.get(PasswordService).hash(password);
    const member = await createAccountWithMembership(db, { email: memberEmail, passwordHash, tenantId });
    const administrator = await createAccountWithMembership(db, { email: adminEmail, passwordHash, tenantId });
    const foreignMember = await createAccountWithMembership(db, { email: foreignMemberEmail, passwordHash, tenantId: foreignTenantId });
    adminMembershipId = administrator.membershipId;
    memberMembershipId = member.membershipId;
    foreignMembershipId = foreignMember.membershipId;
    const [role] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    const [foreignRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${foreignTenantId} and system_key = 'tenant_admin'`;
    foreignRoleId = foreignRole!.id;
    tenantAdminRoleId = role!.id;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${administrator.membershipId}, ${role!.id}, 'tenant')`;
    const memberLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email: memberEmail, password });
    const adminLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email: adminEmail, password });
    memberCookie = (memberLogin.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    adminCookie = (adminLogin.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from tenants where id in (${tenantId}, ${foreignTenantId})`;
      await admin`delete from accounts where normalized_email in (${memberEmail}, ${adminEmail}, ${foreignMemberEmail})`;
    }
    await app?.close();
    await admin?.end();
  });

  it('forbids members without role permissions and allows tenant administrators to list roles', async () => {
    const forbidden = await request(app.getHttpServer()).get('/api/v1/authorization/roles').set('Cookie', memberCookie);
    expect(forbidden.status).toBe(403);
    const allowed = await request(app.getHttpServer()).get('/api/v1/authorization/roles').set('Cookie', adminCookie);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'tenant_admin' })]));
  });

  it('rejects tenant overrides and hides foreign role identifiers on assignment', async () => {
    const overridden = await request(app.getHttpServer()).get(`/api/v1/authorization/roles?tenantId=${foreignTenantId}`).set('Cookie', adminCookie);
    expect(overridden.status).toBe(400);
    const assigned = await request(app.getHttpServer()).post('/api/v1/authorization/assignments')
      .set({ ...headers, Cookie: adminCookie }).send({ membershipId: adminMembershipId, roleId: foreignRoleId, scope: { kind: 'tenant' } });
    expect(assigned.status).toBe(404);
    const foreignMembership = await request(app.getHttpServer()).post('/api/v1/authorization/assignments')
      .set({ ...headers, Cookie: adminCookie }).send({ membershipId: foreignMembershipId, roleId: tenantAdminRoleId, scope: { kind: 'tenant' } });
    expect(foreignMembership.status).toBe(404);
    const foreignSchool = await request(app.getHttpServer()).post('/api/v1/authorization/assignments')
      .set({ ...headers, Cookie: adminCookie }).send({ membershipId: adminMembershipId, roleId: tenantAdminRoleId, scope: { kind: 'school', schoolId: foreignSchoolId } });
    expect(foreignSchool.status).toBe(400);
    const foreignCampus = await request(app.getHttpServer()).post('/api/v1/authorization/assignments')
      .set({ ...headers, Cookie: adminCookie }).send({ membershipId: adminMembershipId, roleId: tenantAdminRoleId, scope: { kind: 'campus', schoolId: foreignSchoolId, campusId: foreignCampusId } });
    expect(foreignCampus.status).toBe(400);
    await admin`delete from schools where id = ${staleSchoolId}`;
    const removedSchool = await request(app.getHttpServer()).post('/api/v1/authorization/assignments')
      .set({ ...headers, Cookie: adminCookie }).send({ membershipId: adminMembershipId, roleId: tenantAdminRoleId, scope: { kind: 'school', schoolId: staleSchoolId } });
    expect(removedSchool.status).toBe(400);
  });

  it('lists permissions, creates and assigns a custom role, then revokes it with audit events', async () => {
    const permissions = await request(app.getHttpServer()).get('/api/v1/authorization/permissions').set('Cookie', adminCookie);
    expect(permissions.status).toBe(200);
    expect(permissions.body).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'attendance.read' })]));

    const created = await request(app.getHttpServer()).post('/api/v1/authorization/roles')
      .set({ ...headers, Cookie: adminCookie }).send({ key: 'campus_reader', name: 'Campus reader', permissionKeys: ['attendance.read'] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ key: 'campus_reader', systemKey: null });

    const assignment = await request(app.getHttpServer()).post('/api/v1/authorization/assignments')
      .set({ ...headers, Cookie: adminCookie })
      .send({ membershipId: memberMembershipId, roleId: created.body.id, scope: { kind: 'tenant' } });
    expect(assignment.status).toBe(201);
    expect(assignment.body).toMatchObject({ membershipId: memberMembershipId, roleId: created.body.id });

    const assignments = await request(app.getHttpServer()).get('/api/v1/authorization/assignments').set('Cookie', adminCookie);
    expect(assignments.status).toBe(200);
    expect(assignments.body).toEqual(expect.arrayContaining([expect.objectContaining({
      id: assignment.body.id, membershipId: memberMembershipId, roleId: created.body.id,
      permissionKeys: ['attendance.read'],
    })]));
    const repeated = await request(app.getHttpServer()).post('/api/v1/authorization/roles')
      .set({ ...headers, Cookie: adminCookie }).send({ key: 'campus_reader', name: 'Duplicate Campus reader', permissionKeys: ['attendance.read'] });
    expect(repeated.status).toBe(409);
    const duplicatePermission = await request(app.getHttpServer()).post('/api/v1/authorization/roles')
      .set({ ...headers, Cookie: adminCookie }).send({ key: 'duplicate_permission_role', name: 'Duplicate permission role', permissionKeys: ['attendance.read', 'attendance.read'] });
    expect(duplicatePermission.status).toBe(400);

    const revoked = await request(app.getHttpServer()).delete(`/api/v1/authorization/assignments/${assignment.body.id}`)
      .set({ ...headers, Cookie: adminCookie });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toMatchObject({ id: assignment.body.id });
    const events = await admin<{ eventType: string; requestId: string | null; metadata: Record<string, unknown> }[]>`
      select event_type as "eventType", request_id as "requestId", metadata
      from security_events where tenant_id = ${tenantId}
      order by created_at, id
    `;
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'authorization_role_created', requestId: expect.any(String), metadata: expect.objectContaining({ afterPermissionKeys: 'attendance.read' }) }),
      expect.objectContaining({ eventType: 'authorization_role_assigned', requestId: expect.any(String), metadata: expect.objectContaining({
        membershipId: memberMembershipId, permissionKeys: 'attendance.read', schoolId: null, campusId: null,
        beforeScopeKind: '', afterScopeKind: 'tenant', afterPermissionKeys: 'attendance.read',
      }) }),
      expect.objectContaining({ eventType: 'authorization_role_revoked', requestId: expect.any(String), metadata: expect.objectContaining({
        membershipId: memberMembershipId, permissionKeys: 'attendance.read', schoolId: null, campusId: null,
        beforeScopeKind: 'tenant', beforePermissionKeys: 'attendance.read', afterScopeKind: '', afterPermissionKeys: '',
      }) }),
    ]));
  });

  it('bootstraps an existing active membership idempotently and audits the trusted path', async () => {
    const db = app.get(DatabaseService).db;
    const first = await bootstrapTenantAdmin(db, { tenantId: tenantId, email: memberEmail });
    const second = await bootstrapTenantAdmin(db, { tenantId: tenantId, email: memberEmail });
    expect(first.alreadyAssigned).toBe(false);
    expect(second.alreadyAssigned).toBe(true);
    const events = await admin<{ eventType: string; source: string }[]>`
      select event_type as "eventType", metadata->>'source' as source from security_events
      where tenant_id = ${tenantId} and event_type = 'tenant_admin_bootstrapped'
    `;
    expect(events).toEqual([{ eventType: 'tenant_admin_bootstrapped', source: 'trusted_bootstrap_cli' }]);
  });
  it('rejects authorization from a still-valid session after membership suspension', async () => {
    await admin`update memberships set status = 'suspended' where id = ${memberMembershipId}`;
    const session = await request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', memberCookie);
    expect(session.status).toBe(401);
    const protectedRoles = await request(app.getHttpServer()).get('/api/v1/authorization/roles').set('Cookie', memberCookie);
    expect(protectedRoles.status).toBe(401);
  });
});

