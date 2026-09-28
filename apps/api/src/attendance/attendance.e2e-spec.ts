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
const mutationHeaders = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };

describe.skipIf(!enabled)('attendance API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const adminEmail = `attendance-admin-${randomUUID()}@example.test`;
  const ordinaryEmail = `attendance-ordinary-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let adminCookie: string;
  let ordinaryCookie: string;
  let sessionId: string;
  let sectionId: string;
  let studentId: string;
  let academicEnrollmentId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Attendance API', ${`attendance-api-${tenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Attendance School', 'ATT-API', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const administrator = await createAccountWithMembership(db, { email: adminEmail, passwordHash: hash, tenantId });
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    const [tenantRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values
      (${tenantId}, ${administrator.membershipId}, ${tenantRole!.id}, 'tenant')`;
    const login = async (email: string) => {
      const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set(mutationHeaders).send({ email, password });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return (result.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    };
    adminCookie = await login(adminEmail);
    ordinaryCookie = await login(ordinaryEmail);

    const session = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: '2026–27', code: 'ATT-2026', startDate: '2026-01-01', endDate: '2027-01-01' });
    expect(session.status, JSON.stringify(session.body)).toBe(201);
    sessionId = session.body.id;
    const klass = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${sessionId}/classes`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Grade 1', code: 'ATT-G1' });
    const section = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${klass.body.id}/sections`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Section A', code: 'ATT-A' });
    sectionId = section.body.id;
    const student = await request(app.getHttpServer()).post(`/api/v1/people/schools/${schoolId}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'ATT-STU-1', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2018-03-04',
    });
    expect(student.status, JSON.stringify(student.body)).toBe(201);
    studentId = student.body.id;
    const schoolEnrollment = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/students/${studentId}/school-enrollments`)
      .set({ ...mutationHeaders, Cookie: adminCookie }).send({ admissionNumber: 'ATT-ADM-1', admissionDate: '2026-01-01' });
    expect(schoolEnrollment.status, JSON.stringify(schoolEnrollment.body)).toBe(201);
    const academic = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/school-enrollments/${schoolEnrollment.body.id}/academic-enrollments`)
      .set({ ...mutationHeaders, Cookie: adminCookie }).send({ sessionId, classId: klass.body.id, sectionId, startDate: '2026-01-01', rollNumber: '1' });
    expect(academic.status, JSON.stringify(academic.body)).toBe(201);
    academicEnrollmentId = academic.body.id;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from daily_attendance_events where tenant_id = ${tenantId}`;
      await admin`delete from daily_attendance_entries where tenant_id = ${tenantId}`;
      await admin`delete from daily_attendance_registers where tenant_id = ${tenantId}`;
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from academic_sessions where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      await admin`delete from accounts where normalized_email in (${adminEmail}, ${ordinaryEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('enforces authentication, school permission, strict validation, and CSRF', async () => {
    const base = `/api/v1/attendance/schools/${schoolId}/sessions/${sessionId}/register`;
    const query = { date: new Date().toISOString().slice(0, 10), sectionId };
    expect((await request(app.getHttpServer()).get('/api/v1/attendance/schools')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/v1/attendance/schools').set('Cookie', ordinaryCookie)).body).toEqual([]);
    expect((await request(app.getHttpServer()).get(base).query(query).set('Cookie', ordinaryCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).put(base).query(query).set('Cookie', adminCookie).send({ entries: [] })).status).toBe(403);
    const invalid = await request(app.getHttpServer()).put(base).query({ ...query, unexpected: 'no' })
      .set({ ...mutationHeaders, Cookie: adminCookie }).send({ entries: [] });
    expect(invalid.status).toBe(400);
  });

  it('saves a complete roster, reloads it, records corrections, and exposes immutable history', async () => {
    const base = `/api/v1/attendance/schools/${schoolId}/sessions/${sessionId}/register`;
    const date = new Date().toISOString().slice(0, 10);
    const query = { date, sectionId };
    const readBefore = await request(app.getHttpServer()).get(base).query(query).set('Cookie', adminCookie);
    expect(readBefore.status, JSON.stringify(readBefore.body)).toBe(200);
    expect(readBefore.body.completion).toMatchObject({ total: 1, unmarked: 1, complete: false });
    const first = await request(app.getHttpServer()).put(base).query(query).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ entries: [{ academicEnrollmentId, status: 'present' }] });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.completion).toMatchObject({ present: 1, complete: true });
    const correction = await request(app.getHttpServer()).put(base).query(query).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ entries: [{ academicEnrollmentId, status: 'late' }] });
    expect(correction.status, JSON.stringify(correction.body)).toBe(200);
    const events = await request(app.getHttpServer()).get(`/api/v1/attendance/schools/${schoolId}/registers/${correction.body.register.id}/events`).set('Cookie', adminCookie);
    expect(events.status, JSON.stringify(events.body)).toBe(200);
    expect(events.body).toMatchObject([
      { previousStatus: null, status: 'present' }, { previousStatus: 'present', status: 'late' },
    ]);
    expect((await request(app.getHttpServer()).get(base).query(query).set('Cookie', adminCookie)).body.entries[0])
      .toMatchObject({ studentId, status: 'late' });
  });
});
