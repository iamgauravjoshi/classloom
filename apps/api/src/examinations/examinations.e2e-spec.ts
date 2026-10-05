import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject, createAccountWithMembership, createAcademicEnrollment, createSchoolEnrollment, createStudentProfile, seedTenantAuthorization, withTenantContext } from '@classloom/db';
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
describe.skipIf(!enabled)('examination API', () => {
  let app: INestApplication, admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID(), schoolId = randomUUID();
  const emails = ['entry', 'review', 'ordinary'].map((label) => `exams-${label}-${randomUUID()}@example.test`);
  let cookie: string, reviewerCookie: string, ordinaryCookie: string;
  let sessionId: string, classId: string, sectionId: string, subjectId: string;
  const base = () => `/api/v1/examinations/schools/${schoolId}`;
  const post = (path: string, body: object, auth = cookie) => request(app.getHttpServer()).post(`${base()}${path}`).set({ ...headers, Cookie: auth }).send(body);
  const get = (path: string, auth = cookie) => request(app.getHttpServer()).get(`${base()}${path}`).set('Cookie', auth);
  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AUTH_CONFIG)
      .useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Examination API', ${`exam-api-${tenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Exam School', 'EX-API', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const password = 'a secure long passphrase', hash = await app.get(PasswordService).hash(password);
    const members: Awaited<ReturnType<typeof createAccountWithMembership>>[] = [];
    for (const email of emails) members.push(await createAccountWithMembership(db, { email, passwordHash: hash, tenantId }));
    const [role] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    for (const member of members.slice(0, 2)) await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${member.membershipId}, ${role.id}, 'tenant')`;
    const login = async (email: string) => {
      const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email, password });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return (response.headers['set-cookie'] as unknown as string[])[0].split(';', 1)[0];
    };
    cookie = await login(emails[0]); reviewerCookie = await login(emails[1]); ordinaryCookie = await login(emails[2]);
    await withTenantContext(db, tenantId, async (tx) => {
      const scope = { tenantId, schoolId };
      const session = await createAcademicSession(tx, scope, { name: '2026–27', code: 'EX-2026', startDate: '2026-01-01', endDate: '2027-01-01' }); sessionId = session.id;
      const klass = await createAcademicClass(tx, scope, sessionId, { name: 'Grade 1', code: 'EX-G1' }); classId = klass.id;
      const section = await createAcademicSection(tx, scope, classId, { name: 'Section A', code: 'A' }); sectionId = section.id;
      const subject = await createAcademicSubject(tx, scope, sessionId, { name: 'English', code: 'ENG' }); subjectId = subject.id;
      const actor = { actorAccountId: members[0].id, requestId: 'exams-fixture' };
      const student = await createStudentProfile(tx, tenantId, { studentCode: 'EX-1', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2018-03-04' }, actor);
      const enrolled = await createSchoolEnrollment(tx, scope, student.id, { admissionNumber: 'EX-ADM-1', admissionDate: '2026-01-01' }, actor);
      await createAcademicEnrollment(tx, scope, enrolled.id, { sessionId, classId, sectionId, sessionName: session.name, sessionStartDate: session.startDate, sessionEndDate: session.endDate, sessionStatus: 'active', className: klass.name, sectionName: section.name }, { startDate: '2026-01-01', rollNumber: '1' }, actor);
    });
  });
  afterAll(async () => {
    if (admin) {
      await admin`delete from exam_events where tenant_id = ${tenantId}`;
      await admin`delete from exam_corrections where tenant_id = ${tenantId}`;
      await admin`delete from exam_marks where tenant_id = ${tenantId}`;
      await admin`delete from exam_assessments where tenant_id = ${tenantId}`;
      await admin`delete from exams where tenant_id = ${tenantId}`;
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      for (const email of emails) await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    await app?.close();
  });
  it('requires authentication, permission, CSRF, and strict inputs', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/examinations/schools')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/v1/examinations/schools').set('Cookie', ordinaryCookie)).body).toEqual([]);
    expect((await get('/setup', ordinaryCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).post(`${base()}/exams`).set('Cookie', cookie).send({})).status).toBe(403);
    expect((await post('/exams', { sessionId, classId, name: 'Exam', startDate: '2026-09-01', endDate: '2026-09-30', tenantId })).status).toBe(400);
    expect((await post('/exams', { sessionId, classId, name: 'Exam', startDate: '2025-09-01', endDate: '2026-09-30' })).status).toBe(400);
    expect((await request(app.getHttpServer()).get(`/api/v1/examinations/schools/${randomUUID()}/setup`).set('Cookie', cookie)).status).toBe(404);
  });
  it('runs a complete reviewed marks workflow with stale saves and separation of correction approval', async () => {
    const created = await post('/exams', { sessionId, classId, name: 'September examination', startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(created.status, JSON.stringify(created.body)).toBe(201); const examId = created.body.id;
    const added = await post(`/exams/${examId}/assessments`, { expectedVersion: 0, sectionId, subjectId, label: 'English', assessmentDate: '2026-09-20', maximumScore: 10000, passingScore: 3500 });
    expect(added.status, JSON.stringify(added.body)).toBe(201); const assessmentId = added.body.id;
    expect((await post(`/exams/${examId}/lifecycle`, { expectedVersion: 1, action: 'open' })).status).toBe(201);
    const initial = await get(`/assessments/${assessmentId}/sheet`);
    expect(initial.body.marks).toHaveLength(1); const markId = initial.body.marks[0].id;
    const marks = (version: number, score: number) => request(app.getHttpServer()).put(`${base()}/assessments/${assessmentId}/marks`).set({ ...headers, Cookie: cookie }).send({ expectedVersion: version, entries: [{ markId, status: 'scored', score }] });
    const incomplete = await post(`/assessments/${assessmentId}/review`, { expectedVersion: 0, action: 'submit' });
    expect(incomplete.status).toBe(400); expect(incomplete.body.message).toContain('every student');
    expect((await marks(0, 10001)).status).toBe(400);
    expect((await marks(0, 7000)).status).toBe(200); expect((await marks(0, 8000)).status).toBe(409);
    expect((await post(`/assessments/${assessmentId}/review`, { expectedVersion: 1, action: 'submit' })).status).toBe(201);
    expect((await post(`/assessments/${assessmentId}/review`, { expectedVersion: 2, action: 'lock' }, reviewerCookie)).status).toBe(201);
    expect((await marks(3, 8000)).status).toBe(409);
    const correction = await post(`/assessments/${assessmentId}/corrections`, { expectedVersion: 3, markId, status: 'scored', score: 8000, reason: 'Rechecked script' });
    expect(correction.status, JSON.stringify(correction.body)).toBe(201); const correctionId = correction.body.corrections[0].id;
    expect(correction.body.marks[0].score).toBe(7000);
    const decision = { expectedVersion: 4, correctionId, decision: 'approve', reason: 'Verified second page' };
    expect((await post(`/assessments/${assessmentId}/decisions`, decision)).status).toBe(400);
    const approved = await post(`/assessments/${assessmentId}/decisions`, decision, reviewerCookie);
    expect(approved.status, JSON.stringify(approved.body)).toBe(201); expect(approved.body.marks[0].score).toBe(8000);
    expect((await post(`/exams/${examId}/lifecycle`, { expectedVersion: 2, action: 'complete' })).body.status).toBe('completed');
    expect((await get(`/assessments/${assessmentId}/sheet`)).body.events.map((e: { eventType: string }) => e.eventType)).toContain('correction_approve');
  });
});
