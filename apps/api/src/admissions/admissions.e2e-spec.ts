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

describe.skipIf(!enabled)('admissions API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID(); const schoolId = randomUUID(); const otherSchoolId = randomUUID();
  const foreignTenantId = randomUUID(); const foreignSchoolId = randomUUID();
  const adminEmail = `admissions-admin-${randomUUID()}@example.test`;
  const officerEmail = `admissions-officer-${randomUUID()}@example.test`;
  const readerEmail = `admissions-reader-${randomUUID()}@example.test`;
  const ordinaryEmail = `admissions-ordinary-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let adminCookie: string; let officerCookie: string; let readerCookie: string; let ordinaryCookie: string;
  let sessionId: string; let classId: string; let sectionId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Admissions API', ${`admissions-api-${tenantId}`}), (${foreignTenantId}, 'Foreign Admissions API', ${`foreign-admissions-api-${foreignTenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Admissions School', 'ADM', 'UTC', 'USD'), (${otherSchoolId}, ${tenantId}, 'Other School', 'OTHER', 'UTC', 'USD'), (${foreignSchoolId}, ${foreignTenantId}, 'Foreign School', 'FOREIGN', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const tenantAdmin = await createAccountWithMembership(db, { email: adminEmail, passwordHash: hash, tenantId });
    const officer = await createAccountWithMembership(db, { email: officerEmail, passwordHash: hash, tenantId });
    const reader = await createAccountWithMembership(db, { email: readerEmail, passwordHash: hash, tenantId });
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    const roles = await admin<{ id: string; system_key: string }[]>`select id, system_key from authorization_roles where tenant_id = ${tenantId}`;
    const role = (key: string) => roles.find((candidate) => candidate.system_key === key)!.id;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${tenantAdmin.membershipId}, ${role('tenant_admin')}, 'tenant')`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind, school_id) values (${tenantId}, ${officer.membershipId}, ${role('admission_officer')}, 'school', ${schoolId}), (${tenantId}, ${reader.membershipId}, ${role('principal')}, 'school', ${schoolId})`;
    const login = async (email: string) => {
      const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set(headers).send({ email, password });
      return (result.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    };
    adminCookie = await login(adminEmail); officerCookie = await login(officerEmail); readerCookie = await login(readerEmail); ordinaryCookie = await login(ordinaryEmail);
    const session = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions`).set({ ...headers, Cookie: adminCookie })
      .send({ name: '2026–27', code: 'ADM-2026-27', startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(session.status, JSON.stringify(session.body)).toBe(201);
    sessionId = session.body.id;
    const klass = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${sessionId}/classes`).set({ ...headers, Cookie: adminCookie }).send({ name: 'Grade 8', code: 'ADM-G8' });
    expect(klass.status, JSON.stringify(klass.body)).toBe(201);
    classId = klass.body.id;
    const section = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${classId}/sections`).set({ ...headers, Cookie: adminCookie }).send({ name: 'Section A', code: 'ADM-A' });
    expect(section.status, JSON.stringify(section.body)).toBe(201);
    sectionId = section.body.id;
    expect(sectionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from admission_cases where tenant_id = ${tenantId}`;
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_guardian_relationships where tenant_id = ${tenantId}`;
      await admin`delete from guardian_profiles where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from academic_teacher_assignments where tenant_id = ${tenantId}`;
      await admin`delete from academic_sections where tenant_id = ${tenantId}`;
      await admin`delete from academic_classes where tenant_id = ${tenantId}`;
      await admin`delete from academic_subjects where tenant_id = ${tenantId}`;
      await admin`delete from academic_sessions where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id in (${tenantId}, ${foreignTenantId})`;
      await admin`delete from accounts where normalized_email in (${adminEmail}, ${officerEmail}, ${readerEmail}, ${ordinaryEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('enforces authentication, school scope, capability flags, and Admission Officer least privilege', async () => {
    const base = `/api/v1/admissions/schools/${schoolId}/cases`;
    expect((await request(app.getHttpServer()).get('/api/v1/admissions/schools')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/v1/admissions/schools').set('Cookie', ordinaryCookie)).body).toEqual([]);
    const schools = await request(app.getHttpServer()).get('/api/v1/admissions/schools').set('Cookie', officerCookie);
    expect(schools.body).toEqual([expect.objectContaining({ id: schoolId, canReadAdmissions: true, canManageAdmissions: true, canConvertAdmissions: true })]);
    expect((await request(app.getHttpServer()).get(base).set('Cookie', readerCookie)).status).toBe(200);
    expect((await request(app.getHttpServer()).post(base).set({ ...headers, Cookie: readerCookie }).send({ studentGivenName: 'Asha' })).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/admissions/schools/${otherSchoolId}/cases`).set('Cookie', officerCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/admissions/schools/${foreignSchoolId}/cases`).set('Cookie', adminCookie)).status).toBe(403);
    const directEnrollment = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/admissions`).set({ ...headers, Cookie: officerCookie }).send({
      student: { studentCode: 'NO-BROAD-ACCESS', givenName: 'Test', familyName: 'Student', dateOfBirth: '2014-01-01' },
      schoolEnrollment: { admissionNumber: 'NO-BROAD-ACCESS', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId: randomUUID(), classId: randomUUID(), sectionId: randomUUID(), startDate: '2026-04-01' },
    });
    expect(directEnrollment.status).toBe(403);
  });

  it('runs enquiry through accepted conversion atomically and reports field-specific validation', async () => {
    const base = `/api/v1/admissions/schools/${schoolId}/cases`;
    const invalid = await request(app.getHttpServer()).post(base).set({ ...headers, Cookie: officerCookie }).send({ studentDateOfBirth: 'not-a-date' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.fields).toBeDefined();
    const created = await request(app.getHttpServer()).post(base).set({ ...headers, Cookie: officerCookie }).send({
      studentGivenName: 'Anya', studentFamilyName: 'Shah', studentDateOfBirth: '2014-05-10',
      guardians: [{ givenName: 'Mira', familyName: 'Shah', relationshipType: 'mother', primaryContact: true }],
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await request(app.getHttpServer()).post(`${base}/${id}/draft`).set({ ...headers, Cookie: officerCookie }).send({}).expect(201);
    await request(app.getHttpServer()).post(`${base}/${id}/submit`).set({ ...headers, Cookie: officerCookie }).send({}).expect(201);
    await request(app.getHttpServer()).post(`${base}/${id}/review`).set({ ...headers, Cookie: officerCookie }).send({ action: 'start_review' }).expect(201);
    await request(app.getHttpServer()).post(`${base}/${id}/decision`).set({ ...headers, Cookie: officerCookie }).send({ action: 'accept', note: 'Eligible for admission' }).expect(201);
    const failedPlacement = await request(app.getHttpServer()).post(`${base}/${id}/admit`).set({ ...headers, Cookie: officerCookie }).send({
      studentCode: 'ADM-API-ROLLBACK', schoolEnrollment: { admissionNumber: 'ADM-API-ROLLBACK', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId, classId, sectionId: randomUUID(), startDate: '2026-04-01' }, guardianCodes: ['ADM-GUARD-ROLLBACK'],
    });
    expect(failedPlacement.status, JSON.stringify(failedPlacement.body)).toBe(404);
    expect((await request(app.getHttpServer()).get(`${base}/${id}`).set('Cookie', officerCookie)).body.status).toBe('accepted');
    const [rollbackCount] = await admin<{ count: number }[]>`select count(*)::int as count from student_profiles where tenant_id = ${tenantId} and student_code = 'ADM-API-ROLLBACK'`;
    expect(rollbackCount!.count).toBe(0);
    const conversion = await request(app.getHttpServer()).post(`${base}/${id}/admit`).set({ ...headers, Cookie: officerCookie }).send({
      studentCode: 'ADM-API-STUDENT',
      schoolEnrollment: { admissionNumber: 'ADM-API-NO-1', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId, classId, sectionId, startDate: '2026-04-01' },
      guardianCodes: ['ADM-API-GUARDIAN'],
    });
    expect(conversion.status, JSON.stringify(conversion.body)).toBe(201);
    expect(conversion.body).toMatchObject({ status: 'admitted', convertedStudentId: expect.any(String) });
    const events = await request(app.getHttpServer()).get(`${base}/${id}/events`).set('Cookie', readerCookie);
    expect(events.body.map((event: { eventType: string }) => event.eventType)).toEqual(['created', 'draft', 'submit', 'start_review', 'accept', 'admitted']);
    const duplicate = await request(app.getHttpServer()).post(`${base}/${id}/admit`).set({ ...headers, Cookie: officerCookie }).send({
      studentCode: 'ADM-API-STUDENT',
      schoolEnrollment: { admissionNumber: 'ADM-API-NO-1', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId, classId, sectionId, startDate: '2026-04-01' },
    });
    expect(duplicate.status).toBe(409);
    const counts = await admin<{ students: number; enrollments: number }[]>`
      select (select count(*)::int from student_profiles where tenant_id = ${tenantId} and student_code = 'ADM-API-STUDENT') as students,
             (select count(*)::int from student_school_enrollments where tenant_id = ${tenantId} and admission_number = 'ADM-API-NO-1') as enrollments`;
    expect(counts[0]).toEqual({ students: 1, enrollments: 1 });
  });
});
