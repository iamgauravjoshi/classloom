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

describe.skipIf(!enabled)('student guardian and enrollment API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const otherSchoolId = randomUUID();
  const foreignTenantId = randomUUID();
  const foreignSchoolId = randomUUID();
  const adminEmail = `enrollment-admin-${randomUUID()}@example.test`;
  const schoolEmail = `enrollment-school-${randomUUID()}@example.test`;
  const ordinaryEmail = `enrollment-ordinary-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let adminCookie: string;
  let schoolCookie: string;
  let ordinaryCookie: string;
  let adminMembershipId: string;
  let sessionId: string;
  let classId: string;
  let sectionOneId: string;
  let sectionTwoId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Enrollment API', ${`enrollment-api-${tenantId}`}), (${foreignTenantId}, 'Foreign Enrollment API', ${`foreign-enrollment-api-${foreignTenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'School One', 'ONE', 'UTC', 'USD'), (${otherSchoolId}, ${tenantId}, 'School Two', 'TWO', 'UTC', 'USD'), (${foreignSchoolId}, ${foreignTenantId}, 'Foreign School', 'FOREIGN', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const administrator = await createAccountWithMembership(db, { email: adminEmail, passwordHash: hash, tenantId });
    adminMembershipId = administrator.membershipId;
    const schoolManager = await createAccountWithMembership(db, { email: schoolEmail, passwordHash: hash, tenantId });
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    const [tenantRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    const [schoolRole] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'school_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${administrator.membershipId}, ${tenantRole!.id}, 'tenant')`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind, school_id) values (${tenantId}, ${schoolManager.membershipId}, ${schoolRole!.id}, 'school', ${schoolId})`;
    const login = async (email: string) => {
      const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set(mutationHeaders).send({ email, password });
      return (result.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    };
    adminCookie = await login(adminEmail);
    schoolCookie = await login(schoolEmail);
    ordinaryCookie = await login(ordinaryEmail);
    const session = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: '2026–27', code: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' });
    sessionId = session.body.id;
    const klass = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${sessionId}/classes`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Grade 8', code: 'G8' });
    classId = klass.body.id;
    const one = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${classId}/sections`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Section A', code: 'A' });
    sectionOneId = one.body.id;
    const two = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${classId}/sections`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Section B', code: 'B' });
    sectionTwoId = two.body.id;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_guardian_relationships where tenant_id = ${tenantId}`;
      await admin`delete from guardian_profiles where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id in (${tenantId}, ${foreignTenantId})`;
      await admin`delete from accounts where normalized_email in (${adminEmail}, ${schoolEmail}, ${ordinaryEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('enforces authentication, CSRF, school scope, and field errors', async () => {
    const base = `/api/v1/people/schools/${schoolId}`;
    expect((await request(app.getHttpServer()).get(`${base}/students`)).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`${base}/students`).set('Cookie', ordinaryCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/people/schools/${otherSchoolId}/students`).set('Cookie', schoolCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/people/schools/${foreignSchoolId}/students`).set('Cookie', adminCookie)).status).toBe(403);
    expect((await request(app.getHttpServer()).post(`${base}/students`).set('Cookie', adminCookie).send({})).status).toBe(403);
    const invalid = await request(app.getHttpServer()).post(`${base}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-1', givenName: 'X', familyName: 'Rao', dateOfBirth: 'bad-date',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.details.fields).toMatchObject({ givenName: expect.any(String), dateOfBirth: expect.any(String) });
  });

  it('atomically admits a student and connects a guardian', async () => {
    const base = `/api/v1/enrollment/schools/${schoolId}/admissions`;
    const input = {
      student: { studentCode: 'S-API-ATOMIC', givenName: 'Diya', familyName: 'Mehta', dateOfBirth: '2014-05-10' },
      schoolEnrollment: { admissionNumber: 'ADM-API-ATOMIC', admissionDate: '2026-04-01' },
      academicEnrollment: { sessionId, classId, sectionId: sectionOneId, startDate: '2026-04-01' },
      guardians: [{ guardian: { guardianCode: 'G-API-ATOMIC', givenName: 'Nisha', familyName: 'Mehta' }, relationship: { relationshipType: 'mother', primaryContact: true } }],
    };
    const invalid = await request(app.getHttpServer()).post(base).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ ...input, academicEnrollment: { ...input.academicEnrollment, sectionId: randomUUID() } });
    expect(invalid.status).toBe(404);
    const [rolledBack] = await admin<{ count: number }[]>`select count(*)::int as count from student_profiles where tenant_id = ${tenantId} and student_code = 'S-API-ATOMIC'`;
    expect(rolledBack!.count).toBe(0);
    const admitted = await request(app.getHttpServer()).post(base).set({ ...mutationHeaders, Cookie: adminCookie }).send(input);
    expect(admitted.status).toBe(201);
    expect(admitted.body).toMatchObject({ student: { studentCode: 'S-API-ATOMIC' }, schoolEnrollment: { admissionNumber: 'ADM-API-ATOMIC' }, academicEnrollment: { sectionId: sectionOneId }, guardians: [{ guardian: { guardianCode: 'G-API-ATOMIC' }, relationship: { primaryContact: true } }] });
    const anotherGuardian = await request(app.getHttpServer()).post(`/api/v1/people/schools/${schoolId}/students/${admitted.body.student.id}/guardians/new`)
      .set({ ...mutationHeaders, Cookie: adminCookie }).send({ guardian: { guardianCode: 'G-API-ATOMIC-2', givenName: 'Raj', familyName: 'Mehta' }, relationship: { relationshipType: 'father', emergencyContact: true } });
    expect(anotherGuardian.status).toBe(201);
    const profile = await request(app.getHttpServer()).get(`/api/v1/people/schools/${schoolId}/students/${admitted.body.student.id}`).set('Cookie', schoolCookie);
    expect(profile.body.guardians).toHaveLength(2);
  });

  it('creates searchable students, reusable guardians, relationships, and account links', async () => {
    const base = `/api/v1/people/schools/${schoolId}`;
    const student = await request(app.getHttpServer()).post(`${base}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-API-1', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2013-08-14', email: 'ASHA@example.test',
    });
    expect(student.status).toBe(201);
    const guardian = await request(app.getHttpServer()).post(`${base}/guardians`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      guardianCode: 'G-API-1', givenName: 'Ravi', familyName: 'Rao', phone: '+91 90000',
    });
    expect(guardian.status).toBe(201);
    const relationship = await request(app.getHttpServer()).post(`${base}/students/${student.body.id}/guardians`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      guardianId: guardian.body.id, relationshipType: 'father', primaryContact: true,
    });
    expect(relationship.status).toBe(201);
    const edited = await request(app.getHttpServer()).patch(`${base}/students/${student.body.id}/guardians/${relationship.body.id}`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ emergencyContact: true });
    expect(edited.body).toMatchObject({ primaryContact: true, emergencyContact: true });
    const schoolEnrollment = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/students/${student.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-API-1', admissionDate: '2026-04-01',
    });
    expect(schoolEnrollment.status).toBe(201);
    const linked = await request(app.getHttpServer()).put(`${base}/guardians/${guardian.body.id}/account`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ membershipId: adminMembershipId });
    expect(linked.status).toBe(200);
    const eligible = await request(app.getHttpServer()).get(`${base}/eligible-accounts?profileType=student`).set('Cookie', adminCookie);
    expect(eligible.status).toBe(200);
    expect(eligible.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: adminMembershipId })]));
    const unlinked = await request(app.getHttpServer()).delete(`${base}/guardians/${guardian.body.id}/account`).set({ ...mutationHeaders, Cookie: adminCookie });
    expect(unlinked.body.membershipId).toBeNull();

    const sibling = await request(app.getHttpServer()).post(`${base}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-API-SIB', givenName: 'Mira', familyName: 'Rao', dateOfBirth: '2015-03-10',
    });
    await request(app.getHttpServer()).post(`${base}/students/${sibling.body.id}/guardians`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      guardianId: guardian.body.id, relationshipType: 'father', emergencyContact: true,
    }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/students/${sibling.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-API-SIB', admissionDate: '2026-04-01',
    }).expect(201);
    const guardianDetail = await request(app.getHttpServer()).get(`${base}/guardians/${guardian.body.id}`).set('Cookie', schoolCookie);
    expect(guardianDetail.body.students).toHaveLength(2);
    const guardianEdited = await request(app.getHttpServer()).patch(`${base}/guardians/${guardian.body.id}`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ occupation: 'Engineer' });
    expect(guardianEdited.body.occupation).toBe('Engineer');

    await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${otherSchoolId}/students/${student.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-OTHER-1', admissionDate: '2026-04-01',
    }).expect(201);
    const otherStudent = await request(app.getHttpServer()).post(`/api/v1/people/schools/${otherSchoolId}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-OTHER-SCOPE', givenName: 'Leena', familyName: 'Rao', dateOfBirth: '2013-01-01',
    });
    await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${otherSchoolId}/students/${otherStudent.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-OTHER-SCOPE', admissionDate: '2026-04-01',
    }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/people/schools/${otherSchoolId}/students/${otherStudent.body.id}/guardians`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      guardianId: guardian.body.id, relationshipType: 'father',
    }).expect(201);
    const schoolScopedGuardian = await request(app.getHttpServer()).get(`${base}/guardians/${guardian.body.id}`).set('Cookie', schoolCookie);
    expect(schoolScopedGuardian.body.students.map((item: { student: { id: string } }) => item.student.id)).not.toContain(otherStudent.body.id);
    const forbiddenShared = await request(app.getHttpServer()).patch(`${base}/students/${student.body.id}`).set({ ...mutationHeaders, Cookie: schoolCookie }).send({ preferredName: 'Ash' });
    expect(forbiddenShared.status).toBe(403);
    const allowedShared = await request(app.getHttpServer()).patch(`${base}/students/${student.body.id}`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ preferredName: 'Ash' });
    expect(allowedShared.body.preferredName).toBe('Ash');

    const listed = await request(app.getHttpServer()).get(`${base}/students?q=Asha&limit=1`).set('Cookie', schoolCookie);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([expect.objectContaining({ id: student.body.id, studentCode: 'S-API-1' })]);
    const firstPage = await request(app.getHttpServer()).get(`${base}/students?limit=1`).set('Cookie', schoolCookie);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));
    const secondPage = await request(app.getHttpServer()).get(`${base}/students?limit=1&cursor=${firstPage.body.nextCursor}`).set('Cookie', schoolCookie);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);
    const guardianList = await request(app.getHttpServer()).get(`${base}/guardians?q=Ravi`).set('Cookie', schoolCookie);
    expect(guardianList.body.items).toEqual([expect.objectContaining({ id: guardian.body.id })]);
  });

  it('runs initial placement, transfer, withdrawal, and returns readable conflicts', async () => {
    const peopleBase = `/api/v1/people/schools/${schoolId}`;
    const student = await request(app.getHttpServer()).post(`${peopleBase}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-API-2', givenName: 'Kabir', familyName: 'Singh', dateOfBirth: '2013-01-01',
    });
    const schoolEnrollment = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/students/${student.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-API-2', admissionDate: '2026-04-01',
    });
    const initial = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/school-enrollments/${schoolEnrollment.body.id}/academic-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      sessionId, classId, sectionId: sectionOneId, rollNumber: 'API-02', startDate: '2026-04-01',
    });
    expect(initial.status).toBe(201);
    const duplicate = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/school-enrollments/${schoolEnrollment.body.id}/academic-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      sessionId, classId, sectionId: sectionOneId, rollNumber: 'API-03', startDate: '2026-04-01',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.message).toMatch(/active placement/i);
    const transferred = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/academic-enrollments/${initial.body.id}/transfer`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      sessionId, classId, sectionId: sectionTwoId, rollNumber: 'API-02-B', effectiveDate: '2026-08-01', reason: 'Section change',
    });
    expect(transferred.body).toMatchObject({ status: 'active', sectionId: sectionTwoId });
    const withdrawn = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/academic-enrollments/${transferred.body.id}/withdraw`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      effectiveDate: '2026-09-01', reason: 'Moved',
    });
    expect(withdrawn.body.status).toBe('withdrawn');
    const history = await request(app.getHttpServer()).get(`/api/v1/enrollment/schools/${schoolId}/school-enrollments/${schoolEnrollment.body.id}/academic-enrollments`).set('Cookie', schoolCookie);
    expect(history.body).toHaveLength(2);

    const completedStudent = await request(app.getHttpServer()).post(`${peopleBase}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-API-COMPLETE', givenName: 'Nila', familyName: 'Shah', dateOfBirth: '2012-01-01',
    });
    const completedSchool = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/students/${completedStudent.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-API-COMPLETE', admissionDate: '2026-04-01',
    });
    const completedPlacement = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/school-enrollments/${completedSchool.body.id}/academic-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      sessionId, classId, sectionId: sectionOneId, startDate: '2026-04-01',
    });
    const completed = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/academic-enrollments/${completedPlacement.body.id}/complete`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ effectiveDate: '2027-03-31' });
    expect(completed.body.status).toBe('completed');

    const archivedSession = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Archived year', code: 'ARCH-API', startDate: '2025-04-01', endDate: '2026-03-31' });
    const archivedClass = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${archivedSession.body.id}/classes`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Grade 7', code: 'G7-ARCH' });
    const archivedSection = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${archivedClass.body.id}/sections`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Section A', code: 'A' });
    await admin`update academic_sessions set status = 'archived' where id = ${archivedSession.body.id}`;
    const archivedStudent = await request(app.getHttpServer()).post(`${peopleBase}/students`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      studentCode: 'S-API-ARCH', givenName: 'Ari', familyName: 'Das', dateOfBirth: '2012-01-01',
    });
    const archivedSchool = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/students/${archivedStudent.body.id}/school-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      admissionNumber: 'ADM-API-ARCH', admissionDate: '2025-04-01',
    });
    const archivedPlacement = await request(app.getHttpServer()).post(`/api/v1/enrollment/schools/${schoolId}/school-enrollments/${archivedSchool.body.id}/academic-enrollments`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      sessionId: archivedSession.body.id, classId: archivedClass.body.id, sectionId: archivedSection.body.id, startDate: '2025-04-01',
    });
    expect(archivedPlacement.status).toBe(404);
    expect(archivedPlacement.body.message).toMatch(/draft or active/i);
  });
});
