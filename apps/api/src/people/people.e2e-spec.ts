import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createAccountWithMembership, seedTenantAuthorization, withTenantContext } from '@classloom/db';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { PasswordService } from '../auth/password.service.js';
import { parseEnv } from '../config/env.js';
import { DatabaseService } from '../database/database.service.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_MIGRATION_URL);
const headers = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };

describe.skipIf(!enabled)('staff and teacher API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const otherSchoolId = randomUUID();
  const foreignTenantId = randomUUID();
  const foreignSchoolId = randomUUID();
  const adminEmail = `people-admin-${randomUUID()}@example.test`;
  const schoolEmail = `people-school-${randomUUID()}@example.test`;
  const ordinaryEmail = `people-ordinary-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let adminCookie: string;
  let schoolCookie: string;
  let ordinaryCookie: string;
  let adminMembershipId: string;
  let schoolMembershipId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'People API', ${`people-api-${tenantId}`}), (${foreignTenantId}, 'Other People API', ${`other-people-api-${foreignTenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'School One', 'ONE', 'UTC', 'USD'), (${otherSchoolId}, ${tenantId}, 'School Two', 'TWO', 'UTC', 'USD'), (${foreignSchoolId}, ${foreignTenantId}, 'Foreign School', 'FOREIGN', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const administrator = await createAccountWithMembership(db, { email: adminEmail, passwordHash: hash, tenantId });
    adminMembershipId = administrator.membershipId;
    const schoolManager = await createAccountWithMembership(db, { email: schoolEmail, passwordHash: hash, tenantId });
    schoolMembershipId = schoolManager.membershipId;
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    const [tenantRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    const [schoolRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'school_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${administrator.membershipId}, ${tenantRole!.id}, 'tenant')`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind, school_id) values (${tenantId}, ${schoolManager.membershipId}, ${schoolRole!.id}, 'school', ${schoolId})`;
    const login = async (email: string) => {
      const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email, password });
      return (result.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    };
    adminCookie = await login(adminEmail);
    schoolCookie = await login(schoolEmail);
    ordinaryCookie = await login(ordinaryEmail);
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from tenants where id in (${tenantId}, ${foreignTenantId})`;
      await admin`delete from accounts where normalized_email in (${adminEmail}, ${schoolEmail}, ${ordinaryEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('checks authentication, school permissions, and CSRF', async () => {
    const base = `/api/v1/people/schools/${schoolId}`;
    expect((await request(app.getHttpServer()).get('/api/v1/people/schools')).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`${base}/staff`).set('Cookie', ordinaryCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/people/schools/${foreignSchoolId}/staff`).set('Cookie', adminCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).post(`${base}/staff`).set('Cookie', adminCookie).send({})).status).toBe(403);
    const schools = await request(app.getHttpServer()).get('/api/v1/people/schools').set('Cookie', schoolCookie);
    expect(schools.status).toBe(200);
    expect(schools.body).toEqual([expect.objectContaining({ id: schoolId })]);
  });

  it('creates, filters, and edits staff with useful validation and conflict errors', async () => {
    const base = `/api/v1/people/schools/${schoolId}`;
    const invalid = await request(app.getHttpServer()).post(`${base}/staff`).set({ ...headers, Cookie: adminCookie }).send({
      staffCode: 'P-1', givenName: 'X', familyName: 'Sharma', designation: 'Teacher', kind: 'teacher',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.fields.givenName).toMatch(/at least 2|2 character/i);
    const created = await request(app.getHttpServer()).post(`${base}/staff`).set({ ...headers, Cookie: adminCookie }).send({
      staffCode: 'P-1', givenName: 'Priya', familyName: 'Sharma', designation: 'Mathematics Teacher', kind: 'teacher', specialization: 'Mathematics',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ staffCode: 'P-1', kind: 'teacher', specialization: 'Mathematics' });
    const duplicate = await request(app.getHttpServer()).post(`${base}/staff`).set({ ...headers, Cookie: adminCookie }).send({
      staffCode: 'p-1', givenName: 'Other', familyName: 'Teacher', designation: 'Teacher', kind: 'staff',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toMatch(/code/i);
    const listed = await request(app.getHttpServer()).get(`${base}/staff?q=Priya&kind=teacher`).set('Cookie', schoolCookie);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([expect.objectContaining({ id: created.body.id })]);
    const addSchool = await request(app.getHttpServer()).post(`${base}/staff/${created.body.id}/affiliations`).set({ ...headers, Cookie: adminCookie }).send({ targetSchoolId: otherSchoolId, designation: 'Visiting Teacher', kind: 'teacher' });
    expect(addSchool.status).toBe(201);
    const forbiddenSharedEdit = await request(app.getHttpServer()).patch(`${base}/staff/${created.body.id}`).set({ ...headers, Cookie: schoolCookie }).send({ profile: { preferredName: 'Pri' } });
    expect(forbiddenSharedEdit.status).toBe(403);
    const allowedSchoolEdit = await request(app.getHttpServer()).patch(`${base}/staff/${created.body.id}`).set({ ...headers, Cookie: schoolCookie }).send({ affiliation: { designation: 'Lead Teacher' } });
    expect(allowedSchoolEdit.status).toBe(200);
    expect(allowedSchoolEdit.body.designation).toBe('Lead Teacher');
    const schoolDetail = await request(app.getHttpServer()).get(`${base}/staff/${created.body.id}`).set('Cookie', schoolCookie);
    expect(schoolDetail.body.canEditShared).toBe(false);
    const adminDetail = await request(app.getHttpServer()).get(`${base}/staff/${created.body.id}`).set('Cookie', adminCookie);
    expect(adminDetail.body.canEditShared).toBe(true);
    const eligible = await request(app.getHttpServer()).get(`${base}/eligible-accounts`).set('Cookie', adminCookie);
    expect(eligible.status).toBe(200);
    expect(eligible.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: schoolMembershipId })]));
    const linked = await request(app.getHttpServer()).put(`${base}/staff/${created.body.id}/account`).set({ ...headers, Cookie: adminCookie }).send({ membershipId: schoolMembershipId });
    expect(linked.status).toBe(400);
    expect(linked.body.message).toMatch(/school/i);
    const teacherChanged = await request(app.getHttpServer()).put(`${base}/staff/${created.body.id}/teacher`).set({ ...headers, Cookie: adminCookie }).send({ qualification: 'MSc' });
    expect(teacherChanged.status).toBe(200);
    expect(teacherChanged.body).toMatchObject({ qualification: 'MSc', specialization: 'Mathematics' });
    const schoolTeacherChange = await request(app.getHttpServer()).put(`${base}/staff/${created.body.id}/teacher`).set({ ...headers, Cookie: schoolCookie }).send({ specialization: 'Physics' });
    expect(schoolTeacherChange.status).toBe(403);
    const validLink = await request(app.getHttpServer()).put(`${base}/staff/${created.body.id}/account`).set({ ...headers, Cookie: adminCookie }).send({ membershipId: adminMembershipId });
    expect(validLink.status).toBe(200);
    expect(validLink.body.membershipId).toBe(adminMembershipId);
    const unlinked = await request(app.getHttpServer()).delete(`${base}/staff/${created.body.id}/account`).set({ ...headers, Cookie: adminCookie });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.membershipId).toBeNull();
    const inactive = await request(app.getHttpServer()).patch(`${base}/staff/${created.body.id}`).set({ ...headers, Cookie: schoolCookie }).send({ affiliation: { status: 'inactive' } });
    expect(inactive.status).toBe(200);
    expect(inactive.body.status).toBe('inactive');
    const filtered = await request(app.getHttpServer()).get(`${base}/staff?status=active`).set('Cookie', schoolCookie);
    expect(filtered.body.items).toEqual([]);
    const foreignStaffId = randomUUID();
    await admin`insert into staff_profiles (id, tenant_id, staff_code, given_name, family_name) values (${foreignStaffId}, ${foreignTenantId}, 'FOREIGN-1', 'Foreign', 'Teacher')`;
    await admin`insert into staff_school_affiliations (tenant_id, staff_id, school_id, designation) values (${foreignTenantId}, ${foreignStaffId}, ${foreignSchoolId}, 'Teacher')`;
    expect((await request(app.getHttpServer()).get(`${base}/staff/${foreignStaffId}`).set('Cookie', adminCookie)).status).toBe(404);
    expect((await request(app.getHttpServer()).post(`${base}/staff/${created.body.id}/affiliations`).set({ ...headers, Cookie: adminCookie }).send({ targetSchoolId: foreignSchoolId, designation: 'Teacher', kind: 'teacher' })).status).toBe(403);
  });
});
