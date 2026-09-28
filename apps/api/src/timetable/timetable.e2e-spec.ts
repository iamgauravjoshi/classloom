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
import { academicTeacherAssignments, weeklyTimetables } from '@classloom/db';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_MIGRATION_URL);
const mutationHeaders = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };

describe.skipIf(!enabled)('timetable API', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID();
  const schoolId = randomUUID();
  const otherSchoolId = randomUUID();
  const adminEmail = `timetable-admin-${randomUUID()}@example.test`;
  const readerEmail = `timetable-reader-${randomUUID()}@example.test`;
  const teacherEmail = `timetable-teacher-${randomUUID()}@example.test`;
  const ordinaryEmail = `timetable-ordinary-${randomUUID()}@example.test`;
  const password = 'a secure long passphrase';
  let adminCookie: string;
  let readerCookie: string;
  let teacherCookie: string;
  let ordinaryCookie: string;
  let teacherMembershipId: string;
  let adminAccountId: string;
  let adminMembershipId: string;
  let sessionId: string;
  let sectionOneId: string;
  let sectionTwoId: string;
  let subjectId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG).useValue(parseEnv({ DATABASE_URL: process.env.DATABASE_URL!, AUTH_LOGIN_LIMIT: '100' })).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Timetable API', ${`timetable-api-${tenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values
      (${schoolId}, ${tenantId}, 'Timetable School', 'TT-API', 'Asia/Kolkata', 'INR'),
      (${otherSchoolId}, ${tenantId}, 'Other School', 'TT-OTHER', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    const hash = await app.get(PasswordService).hash(password);
    const adminMember = await createAccountWithMembership(db, { email: adminEmail, passwordHash: hash, tenantId });
    const readerMember = await createAccountWithMembership(db, { email: readerEmail, passwordHash: hash, tenantId });
    const teacherMember = await createAccountWithMembership(db, { email: teacherEmail, passwordHash: hash, tenantId });
    await createAccountWithMembership(db, { email: ordinaryEmail, passwordHash: hash, tenantId });
    adminAccountId = adminMember.id;
    adminMembershipId = adminMember.membershipId;
    teacherMembershipId = teacherMember.membershipId;
    const roles = await admin<{ id: string; system_key: string }[]>`select id, system_key from authorization_roles where tenant_id = ${tenantId}`;
    const roleId = (key: string) => roles.find((role) => role.system_key === key)!.id;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values
      (${tenantId}, ${adminMember.membershipId}, ${roleId('tenant_admin')}, 'tenant')`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind, school_id) values
      (${tenantId}, ${readerMember.membershipId}, ${roleId('principal')}, 'school', ${schoolId}),
      (${tenantId}, ${teacherMember.membershipId}, ${roleId('teacher')}, 'school', ${schoolId})`;
    const login = async (email: string) => {
      const result = await request(app.getHttpServer()).post('/api/v1/auth/login').set(mutationHeaders).send({ email, password });
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      return (result.headers['set-cookie'] as unknown as string[])[0]!.split(';', 1)[0]!;
    };
    adminCookie = await login(adminEmail);
    readerCookie = await login(readerEmail);
    teacherCookie = await login(teacherEmail);
    ordinaryCookie = await login(ordinaryEmail);

    const session = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: '2026–27', code: 'TT-2026', startDate: '2026-04-01', endDate: '2027-03-31' });
    expect(session.status, JSON.stringify(session.body)).toBe(201);
    sessionId = session.body.id;
    const klass = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${sessionId}/classes`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Grade 8', code: 'TT-G8' });
    expect(klass.status, JSON.stringify(klass.body)).toBe(201);
    const one = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${klass.body.id}/sections`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Section A', code: 'TT-A' });
    const two = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/classes/${klass.body.id}/sections`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Section B', code: 'TT-B' });
    sectionOneId = one.body.id;
    sectionTwoId = two.body.id;
    const subject = await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sessions/${sessionId}/subjects`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ name: 'Mathematics', code: 'TT-MATH' });
    expect(subject.status, JSON.stringify(subject.body)).toBe(201);
    subjectId = subject.body.id;

    const staff = await request(app.getHttpServer()).post(`/api/v1/people/schools/${schoolId}/staff`).set({ ...mutationHeaders, Cookie: adminCookie }).send({
      staffCode: 'TT-TEACHER', givenName: 'Taylor', familyName: 'Teacher', designation: 'Mathematics Teacher', kind: 'teacher',
      qualification: 'B.Ed', specialization: 'Mathematics',
    });
    expect(staff.status, JSON.stringify(staff.body)).toBe(201);
    await request(app.getHttpServer()).put(`/api/v1/people/schools/${schoolId}/staff/${staff.body.id}/account`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ membershipId: teacherMembershipId }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sections/${sectionOneId}/assignments`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ subjectId, membershipId: teacherMembershipId }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/academics/schools/${schoolId}/sections/${sectionTwoId}/assignments`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ subjectId, membershipId: teacherMembershipId }).expect(201);
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from weekly_timetable_events where tenant_id = ${tenantId}`;
      await admin`delete from weekly_timetable_slots where tenant_id = ${tenantId}`;
      await admin`delete from weekly_timetables where tenant_id = ${tenantId}`;
      await admin`delete from academic_teacher_assignments where tenant_id = ${tenantId}`;
      await admin`delete from academic_sessions where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      await admin`delete from accounts where normalized_email in (${adminEmail}, ${readerEmail}, ${teacherEmail}, ${ordinaryEmail})`;
      await admin.end();
    }
    await app?.close();
  });

  it('enforces authentication, school-scoped capabilities, CSRF, and published-only reads', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/timetable/schools')).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/v1/timetable/schools').set('Cookie', ordinaryCookie)).body).toEqual([]);
    const schools = await request(app.getHttpServer()).get('/api/v1/timetable/schools').set('Cookie', teacherCookie);
    expect(schools.body).toEqual([expect.objectContaining({ id: schoolId, canReadTimetable: true, canManageTimetable: false })]);
    expect((await request(app.getHttpServer()).get(`/api/v1/timetable/schools/${otherSchoolId}/sessions/${sessionId}`).set('Cookie', readerCookie)).status).toBe(403);
    const path = `/api/v1/timetable/schools/${schoolId}/sessions/${sessionId}/slots`;
    expect((await request(app.getHttpServer()).post(path).set('Cookie', adminCookie).send({})).status).toBe(403);
    expect((await request(app.getHttpServer()).get(`/api/v1/timetable/schools/${schoolId}/sessions/${sessionId}`).set('Cookie', readerCookie)).body.timetable).toBeNull();
  });

  it('validates references and conflicts, filters teachers, and resets published schedules to draft on edits', async () => {
    const base = `/api/v1/timetable/schools/${schoolId}/sessions/${sessionId}`;
    const assignments = await withTenantContext(app.get(DatabaseService).db, tenantId, (tx) => tx.select().from(academicTeacherAssignments));
    const input = { sessionId, sectionId: sectionOneId, subjectId, teacherAssignmentId: assignments.find((row) => row.sectionId === sectionOneId)!.id,
      weekday: 1, startTime: '09:00', endTime: '09:40', roomLabel: 'Room 1' };
    const invalid = await request(app.getHttpServer()).post(`${base}/slots`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ ...input, subjectId: randomUUID() });
    expect(invalid.status).toBe(404);
    const invalidTime = await request(app.getHttpServer()).post(`${base}/slots`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ ...input, startTime: '9am' });
    expect(invalidTime.status).toBe(400);
    const created = await request(app.getHttpServer()).post(`${base}/slots`).set({ ...mutationHeaders, Cookie: adminCookie }).send(input);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const sameSection = await request(app.getHttpServer()).post(`${base}/slots`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ ...input, startTime: '09:20', endTime: '10:00', teacherAssignmentId: null, roomLabel: null });
    expect(sameSection.status).toBe(409);
    expect(sameSection.body.message).toContain('section');
    const sameTeacher = await request(app.getHttpServer()).post(`${base}/slots`).set({ ...mutationHeaders, Cookie: adminCookie }).send({ ...input, sectionId: sectionTwoId, startTime: '09:00', endTime: '09:40', roomLabel: null, teacherAssignmentId: assignments.find((row) => row.sectionId === sectionTwoId)!.id });
    expect(sameTeacher.status).toBe(409);
    expect(sameTeacher.body.message).toContain('teacher');
    const readerBeforePublish = await request(app.getHttpServer()).get(`${base}?teacherMembershipId=${teacherMembershipId}`).set('Cookie', readerCookie);
    expect(readerBeforePublish.body.slots).toEqual([]);
    const firstPublish = await request(app.getHttpServer()).post(`${base}/publish`).set({ ...mutationHeaders, Cookie: adminCookie }).send({});
    expect(firstPublish.status, JSON.stringify(firstPublish.body)).toBe(201);
    const teacherView = await request(app.getHttpServer()).get(`${base}?teacherMembershipId=${teacherMembershipId}`).set('Cookie', teacherCookie);
    expect(teacherView.body.slots).toHaveLength(1);
    expect(teacherView.body.slots[0].teacherMembershipId).toBe(teacherMembershipId);
    await request(app.getHttpServer()).patch(`/api/v1/timetable/schools/${schoolId}/slots/${created.body.id}`).set({ ...mutationHeaders, Cookie: adminCookie })
      .send({ ...input, startTime: '10:00', endTime: '10:40' }).expect(200);
    const readerAfterEdit = await request(app.getHttpServer()).get(`${base}`).set('Cookie', readerCookie);
    expect(readerAfterEdit.body.timetable).toBeNull();
    const [parent] = await withTenantContext(app.get(DatabaseService).db, tenantId, (tx) => tx.select().from(weeklyTimetables));
    const manualConflictId = randomUUID();
    await admin`insert into weekly_timetable_slots (id, tenant_id, school_id, timetable_id, session_id, section_id, subject_id, teacher_assignment_id, weekday, start_time, end_time, room_label, created_by_account_id, created_by_membership_id, updated_by_account_id, updated_by_membership_id)
      values (${manualConflictId}, ${tenantId}, ${schoolId}, ${parent!.id}, ${sessionId}, ${sectionOneId}, ${subjectId}, ${input.teacherAssignmentId}, 1, '10:20', '11:00', 'Room 2', ${adminAccountId}, ${adminMembershipId}, ${adminAccountId}, ${adminMembershipId})`;
    const failedPublish = await request(app.getHttpServer()).post(`${base}/publish`).set({ ...mutationHeaders, Cookie: adminCookie }).send({});
    expect(failedPublish.status).toBe(409);
    expect((await request(app.getHttpServer()).get(`${base}`).set('Cookie', adminCookie)).body.timetable.status).toBe('draft');
    await admin`delete from weekly_timetable_slots where id = ${manualConflictId}`;
    await request(app.getHttpServer()).post(`${base}/publish`).set({ ...mutationHeaders, Cookie: adminCookie }).send({}).expect(201);
    expect((await request(app.getHttpServer()).get(`${base}`).set('Cookie', readerCookie)).body.slots).toHaveLength(1);
    const deleted = await request(app.getHttpServer()).delete(`/api/v1/timetable/schools/${schoolId}/slots/${created.body.id}`).set({ ...mutationHeaders, Cookie: adminCookie });
    expect(deleted.status).toBe(200);
  });

});
