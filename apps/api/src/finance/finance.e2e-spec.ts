import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createAcademicClass, createAcademicSection, createAcademicSession, createAccountWithMembership, createSchoolEnrollment, createStudentProfile, seedTenantAuthorization, withTenantContext } from '@classloom/db';
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

describe.skipIf(!enabled)('finance API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const adminEmail = `finance-admin-${randomUUID()}@example.test`;
  const ordinaryEmail = `finance-ordinary-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let adminCookie: string;
  let ordinaryCookie: string;
  let sessionId: string;
  let classId: string;
  let enrollmentId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Finance API', ${`finance-api-${tenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Finance School', 'FIN-API', 'UTC', 'INR')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const administrator = await createAccountWithMembership(db, { email: adminEmail, passwordHash: hash, tenantId });
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    const [tenantRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${administrator.membershipId}, ${tenantRole!.id}, 'tenant')`;
    const login = async (email: string) => {
      const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set(mutationHeaders).send({ email, password });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return (result.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    };
    adminCookie = await login(adminEmail); ordinaryCookie = await login(ordinaryEmail);
    await withTenantContext(db, tenantId, async (tx) => {
      const scope = { tenantId, schoolId };
      const session = await createAcademicSession(tx, scope, { name: '2026–27', code: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' });
      sessionId = session.id;
      const academicClass = await createAcademicClass(tx, scope, sessionId, { name: 'Grade 1', code: 'G1' }); classId = academicClass.id;
      const section = await createAcademicSection(tx, scope, classId, { name: 'Section A', code: 'A' });
      const student = await createStudentProfile(tx, tenantId, { studentCode: 'FAPI-001', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2018-03-04' }, { actorAccountId: administrator.id, requestId: 'finance-api' });
      const enrolled = await createSchoolEnrollment(tx, scope, student.id, { admissionNumber: 'FAPI-ADM-001', admissionDate: '2026-04-01' }, { actorAccountId: administrator.id, requestId: 'finance-api' });
      enrollmentId = enrolled.id;
      await tx.insert((await import('@classloom/db')).studentAcademicEnrollments).values({ ...scope, studentId: student.id, schoolEnrollmentId: enrollmentId,
        sessionId, classId, sectionId: section.id, startDate: '2026-04-01' });
    });
  });

  afterAll(async () => {
    if (admin) {
      for (const table of ['fee_ledger_entries', 'fee_payments', 'fee_receipt_counters', 'fee_charges', 'fee_assignments', 'fee_plan_lines', 'fee_plans', 'fee_heads', 'student_academic_enrollments', 'student_school_enrollments', 'student_profiles', 'academic_sessions']) {
        await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]);
      }
      await admin`delete from tenants where id = ${tenantId}`;
      await admin`delete from accounts where normalized_email in (${adminEmail}, ${ordinaryEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('enforces scoped access, validation, CSRF, and the complete offline payment flow', async () => {
    const base = `/api/v1/finance/schools/${schoolId}`;
    const get = (path: string, cookie = adminCookie) => request(app.getHttpServer()).get(`${base}${path}`).set('Cookie', cookie);
    const post = (path: string, body: object, cookie = adminCookie) => request(app.getHttpServer()).post(`${base}${path}`).set({ ...mutationHeaders, Cookie: cookie }).send(body);
    expect((await request(app.getHttpServer()).get('/api/v1/finance/schools')).status).toBe(401);
    expect((await get('/setup', ordinaryCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).post(`${base}/heads`).set('Cookie', adminCookie).send({ code: 'T', name: 'Tuition' })).status).toBe(403);
    expect((await post('/heads', { code: '', name: 'Tuition' })).status).toBe(400);
    const head = await post('/heads', { code: 'TUITION', name: 'Tuition' });
    expect(head.status, JSON.stringify(head.body)).toBe(201);
    const plan = await post('/plans', { sessionId, classId, name: 'Annual' });
    expect(plan.status, JSON.stringify(plan.body)).toBe(201);
    const line = await post(`/plans/${plan.body.id}/lines`, { headId: head.body.id, label: 'Term 1', dueDate: '2026-10-01', amountMinor: '10000' });
    expect(line.status, JSON.stringify(line.body)).toBe(201);
    const assigned = await post(`/plans/${plan.body.id}/assignments`, { schoolEnrollmentId: enrollmentId });
    expect(assigned.status, JSON.stringify(assigned.body)).toBe(201);
    const statement = await get(`/statements/${enrollmentId}`);
    expect(statement.body.outstandingMinor).toBe('10000');
    const chargeId = statement.body.charges[0].id;
    const key = randomUUID();
    const paymentBody = { schoolEnrollmentId: enrollmentId, idempotencyKey: key, method: 'cash', allocations: [{ chargeId, amountMinor: '3000' }] };
    const payment = await post('/payments', paymentBody);
    expect(payment.status, JSON.stringify(payment.body)).toBe(201);
    expect((await post('/payments', paymentBody)).body.id).toBe(payment.body.id);
    expect((await get(`/statements/${enrollmentId}`)).body.outstandingMinor).toBe('7000');
    const reversal = await post(`/payments/${payment.body.id}/reversal`, { reason: 'Entry duplicated' });
    expect(reversal.status, JSON.stringify(reversal.body)).toBe(201);
    expect(reversal.body.reversed).toBe(true);
    expect((await get(`/statements/${enrollmentId}`)).body.outstandingMinor).toBe('10000');
    const concurrent = await Promise.all([randomUUID(), randomUUID()].map((idempotencyKey) => post('/payments', {
      schoolEnrollmentId: enrollmentId, idempotencyKey, method: 'cash', allocations: [{ chargeId, amountMinor: '6000' }],
    })));
    expect(concurrent.map((result) => result.status).sort()).toEqual([201, 400]);
    expect((await get(`/statements/${enrollmentId}`)).body.outstandingMinor).toBe('4000');
  });
});
