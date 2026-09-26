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

describe.skipIf(!enabled)('academic setup API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const foreignSchoolId = randomUUID();
  const foreignTenantId = randomUUID();
  const email = `academic-admin-${randomUUID()}@example.test`;
  const ordinaryEmail = `academic-member-${randomUUID()}@example.test`;
  const disabledEmail = `academic-disabled-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let cookie: string;
  let ordinaryCookie: string;
  let administratorMembershipId: string;
  let disabledMembershipId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Academic API', ${`academic-api-${tenantId}`}), (${foreignTenantId}, 'Foreign Academic API', ${`foreign-academic-${foreignTenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Test School', 'TEST', 'UTC', 'USD'), (${foreignSchoolId}, ${foreignTenantId}, 'Foreign School', 'FOREIGN', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const administrator = await createAccountWithMembership(db, { email, passwordHash: hash, tenantId });
    administratorMembershipId = administrator.membershipId;
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    const disabledMember = await createAccountWithMembership(db, { email: disabledEmail, passwordHash: hash, tenantId });
    disabledMembershipId = disabledMember.membershipId;
    const [role] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${administrator.membershipId}, ${role!.id}, 'tenant')`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${disabledMembershipId}, ${role!.id}, 'tenant')`;
    await admin`update accounts set status = 'disabled' where normalized_email = ${disabledEmail}`;
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email, password });
    cookie = (login.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    const ordinaryLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email: ordinaryEmail, password });
    ordinaryCookie = (ordinaryLogin.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from tenants where id in (${tenantId}, ${foreignTenantId})`;
      await admin`delete from accounts where normalized_email in (${email}, ${ordinaryEmail}, ${disabledEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('enforces authentication, school permission, and school boundaries', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/academics/schools')).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`/api/v1/academics/schools/${schoolId}/setup`).set('Cookie', ordinaryCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/academics/schools/${foreignSchoolId}/setup`).set('Cookie', cookie)).status).toBe(403);
    const list = await request(app.getHttpServer()).get('/api/v1/academics/schools').set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([expect.objectContaining({ id: schoolId })]);
  });

  it('creates and activates a session through the API', async () => {
    const base = `/api/v1/academics/schools/${schoolId}`;
    const missingCsrf = await request(app.getHttpServer()).post(`${base}/sessions`).set('Cookie', cookie).send({ name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(missingCsrf.status).toBe(403);
    const created = await request(app.getHttpServer()).post(`${base}/sessions`).set({ ...headers, Cookie: cookie }).send({ name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(created.status).toBe(201);
    const sessionId = created.body.id as string;
    const incomplete = await request(app.getHttpServer()).post(`${base}/sessions/${sessionId}/activate`).set({ ...headers, Cookie: cookie }).send({});
    expect(incomplete.status).toBe(400);
    const klass = await request(app.getHttpServer()).post(`${base}/sessions/${sessionId}/classes`).set({ ...headers, Cookie: cookie }).send({ name: 'Grade 1', code: 'G1' });
    expect(klass.status).toBe(201);
    const section = await request(app.getHttpServer()).post(`${base}/classes/${klass.body.id}/sections`).set({ ...headers, Cookie: cookie }).send({ name: 'Section A', code: 'A' });
    expect(section.status).toBe(201);
    const subject = await request(app.getHttpServer()).post(`${base}/sessions/${sessionId}/subjects`).set({ ...headers, Cookie: cookie }).send({ name: 'Mathematics', code: 'MATH' });
    expect(subject.status).toBe(201);
    const staff = await request(app.getHttpServer()).get(`${base}/staff`).set('Cookie', cookie);
    expect(staff.status).toBe(200);
    expect(staff.body).toEqual([]);
    const disabledAssignment = await request(app.getHttpServer()).post(`${base}/sections/${section.body.id}/assignments`).set({ ...headers, Cookie: cookie }).send({ subjectId: subject.body.id, membershipId: disabledMembershipId });
    expect(disabledAssignment.status).toBe(404);
    const unlinkedAssignment = await request(app.getHttpServer()).post(`${base}/sections/${section.body.id}/assignments`).set({ ...headers, Cookie: cookie }).send({ subjectId: subject.body.id, membershipId: administratorMembershipId });
    expect(unlinkedAssignment.status).toBe(400);
    expect(unlinkedAssignment.body.message).toMatch(/teacher profile/i);
    const person = await request(app.getHttpServer()).post(`/api/v1/people/schools/${schoolId}/staff`).set({ ...headers, Cookie: cookie }).send({
      staffCode: 'MATH-1', givenName: 'Priya', familyName: 'Sharma', designation: 'Mathematics Teacher', kind: 'teacher',
    });
    expect(person.status).toBe(201);
    const linked = await request(app.getHttpServer()).put(`/api/v1/people/schools/${schoolId}/staff/${person.body.id}/account`).set({ ...headers, Cookie: cookie }).send({ membershipId: administratorMembershipId });
    expect(linked.status).toBe(200);
    const eligible = await request(app.getHttpServer()).get(`${base}/staff`).set('Cookie', cookie);
    expect(eligible.body).toEqual([expect.objectContaining({ id: administratorMembershipId, displayName: 'Priya Sharma' })]);
    const assignment = await request(app.getHttpServer()).post(`${base}/sections/${section.body.id}/assignments`).set({ ...headers, Cookie: cookie }).send({ subjectId: subject.body.id, membershipId: administratorMembershipId });
    expect(assignment.status).toBe(201);
    const duplicate = await request(app.getHttpServer()).post(`${base}/sections/${section.body.id}/assignments`).set({ ...headers, Cookie: cookie }).send({ subjectId: subject.body.id, membershipId: administratorMembershipId });
    expect(duplicate.status).toBe(409);
    const active = await request(app.getHttpServer()).post(`${base}/sessions/${sessionId}/activate`).set({ ...headers, Cookie: cookie }).send({});
    expect(active.status).toBe(201);
    expect(active.body.status).toBe('active');
    const science = await request(app.getHttpServer()).post(`${base}/sessions/${sessionId}/subjects`).set({ ...headers, Cookie: cookie }).send({ name: 'Science', code: 'SCI' });
    expect(science.status).toBe(201);
    await admin`insert into academic_teacher_assignments (tenant_id, school_id, session_id, section_id, subject_id, membership_id) values (${tenantId}, ${schoolId}, ${sessionId}, ${section.body.id}, ${science.body.id}, ${disabledMembershipId})`;
    const setup = await request(app.getHttpServer()).get(`${base}/setup`).set('Cookie', cookie);
    expect(setup.status).toBe(200);
    expect(setup.body).toMatchObject({ school: { id: schoolId }, sessions: [expect.objectContaining({ status: 'active' })] });
    expect(setup.body.assignmentAccounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: administratorMembershipId }),
      expect.objectContaining({ id: disabledMembershipId, email: disabledEmail }),
    ]));
  });

  it('returns useful client errors for invalid academic data', async () => {
    const base = `/api/v1/academics/schools/${schoolId}`;
    const invalidCode = await request(app.getHttpServer()).post(`${base}/sessions`).set({ ...headers, Cookie: cookie })
      .send({ name: 'Another year', code: 'BAD CODE', startDate: '2028-04-01', endDate: '2029-03-31' });
    expect(invalidCode.status).toBe(400);
    expect(invalidCode.body.message).toMatch(/code/i);
    const reversed = await request(app.getHttpServer()).post(`${base}/sessions`).set({ ...headers, Cookie: cookie })
      .send({ name: 'Another year', code: '2028', startDate: '2029-04-01', endDate: '2028-03-31' });
    expect(reversed.status).toBe(400);
    expect(reversed.body.message).toMatch(/end date/i);
  });
});
