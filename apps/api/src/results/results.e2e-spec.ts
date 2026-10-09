import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  createAcademicClass,
  createAcademicSection,
  createAcademicSession,
  createAcademicSubject,
  createAccountWithMembership,
  createAcademicEnrollment,
  createSchoolEnrollment,
  createStudentProfile,
  seedTenantAuthorization,
  withTenantContext,
  createGuardianProfile,
  createOrUpdateGuardianRelationship,
  linkStudentMembership,
  linkGuardianMembership,
} from '@classloom/db';
import postgres from 'postgres';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { AUTH_CONFIG } from '../auth/auth.constants.js';
import { PasswordService } from '../auth/password.service.js';
import { parseEnv } from '../config/env.js';
import { DatabaseService } from '../database/database.service.js';

const enabled = Boolean(
  process.env.DATABASE_URL && process.env.DATABASE_MIGRATION_URL,
);
const headers = { Origin: 'http://localhost:3000', 'X-ClassLoom-Request': '1' };
describe.skipIf(!enabled)('Results API', () => {
  let app: INestApplication, admin: ReturnType<typeof postgres>;
  const tenantId = randomUUID(),
    schoolId = randomUUID();
  const emails = ['entry', 'review', 'student', 'guardian', 'ordinary'].map(
    (label) => `exams-${label}-${randomUUID()}@example.test`,
  );
  let cookie: string,
    reviewerCookie: string,
    ordinaryCookie: string,
    studentCookie: string,
    guardianCookie: string;
  let studentId: string, guardianId: string;
  let sessionId: string, classId: string, sectionId: string, subjectId: string;
  const base = () => `/api/v1/examinations/schools/${schoolId}`;
  const post = (path: string, body: object, auth = cookie) =>
    request(app.getHttpServer())
      .post(`${base()}${path}`)
      .set({ ...headers, Cookie: auth })
      .send(body);
  const get = (path: string, auth = cookie) =>
    request(app.getHttpServer()).get(`${base()}${path}`).set('Cookie', auth);
  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_CONFIG)
      .useValue(
        parseEnv({
          DATABASE_URL: process.env.DATABASE_URL!,
          AUTH_LOGIN_LIMIT: '100',
        }),
      )
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'Examination API', ${`exam-api-${tenantId}`})`;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${schoolId}, ${tenantId}, 'Exam School', 'EX-API', 'UTC', 'USD')`;
    const db = app.get(DatabaseService).db;
    await withTenantContext(db, tenantId, (tx) =>
      seedTenantAuthorization(tx, tenantId),
    );
    const password = 'a secure long passphrase',
      hash = await app.get(PasswordService).hash(password);
    const members: Awaited<ReturnType<typeof createAccountWithMembership>>[] =
      [];
    for (const email of emails)
      members.push(
        await createAccountWithMembership(db, {
          email,
          passwordHash: hash,
          tenantId,
        }),
      );
    const [role] = await admin<
      { id: string }[]
    >`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    for (const member of members.slice(0, 2))
      await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${member.membershipId}, ${role.id}, 'tenant')`;
    const login = async (email: string) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set(headers)
        .send({ email, password });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      return (response.headers['set-cookie'] as unknown as string[])[0].split(
        ';',
        1,
      )[0];
    };
    cookie = await login(emails[0]);
    reviewerCookie = await login(emails[1]);
    studentCookie = await login(emails[2]);
    guardianCookie = await login(emails[3]);
    ordinaryCookie = await login(emails[4]);
    await withTenantContext(db, tenantId, async (tx) => {
      const scope = { tenantId, schoolId };
      const session = await createAcademicSession(tx, scope, {
        name: '2026–27',
        code: 'EX-2026',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
      });
      sessionId = session.id;
      const klass = await createAcademicClass(tx, scope, sessionId, {
        name: 'Grade 1',
        code: 'EX-G1',
      });
      classId = klass.id;
      const section = await createAcademicSection(tx, scope, classId, {
        name: 'Section A',
        code: 'A',
      });
      sectionId = section.id;
      const subject = await createAcademicSubject(tx, scope, sessionId, {
        name: 'English',
        code: 'ENG',
      });
      subjectId = subject.id;
      const actor = {
        actorAccountId: members[0].id,
        requestId: 'exams-fixture',
      };
      const student = await createStudentProfile(
        tx,
        tenantId,
        {
          studentCode: 'EX-1',
          givenName: 'Asha',
          familyName: 'Rao',
          dateOfBirth: '2018-03-04',
        },
        actor,
      );
      studentId = student.id;
      await linkStudentMembership(
        tx,
        tenantId,
        studentId,
        members[2].membershipId,
        actor,
      );
      const guardian = await createGuardianProfile(
        tx,
        tenantId,
        { guardianCode: 'RG-1', givenName: 'Maya', familyName: 'Rao' },
        actor,
      );
      guardianId = guardian.id;
      await linkGuardianMembership(
        tx,
        tenantId,
        guardianId,
        members[3].membershipId,
        actor,
      );
      await createOrUpdateGuardianRelationship(
        tx,
        tenantId,
        studentId,
        guardianId,
        { relationshipType: 'mother', portalAccess: true },
        actor,
      );
      const enrolled = await createSchoolEnrollment(
        tx,
        scope,
        student.id,
        { admissionNumber: 'EX-ADM-1', admissionDate: '2026-01-01' },
        actor,
      );
      await createAcademicEnrollment(
        tx,
        scope,
        enrolled.id,
        {
          sessionId,
          classId,
          sectionId,
          sessionName: session.name,
          sessionStartDate: session.startDate,
          sessionEndDate: session.endDate,
          sessionStatus: 'active',
          className: klass.name,
          sectionName: section.name,
        },
        { startDate: '2026-01-01', rollNumber: '1' },
        actor,
      );
    });
  });
  afterAll(async () => {
    if (admin) {
      await admin`delete from result_events where tenant_id = ${tenantId}`;
      await admin`delete from result_reports where tenant_id = ${tenantId}`;
      await admin`delete from result_batches where tenant_id = ${tenantId}`;
      await admin`delete from result_grading_policies where tenant_id = ${tenantId}`;
      await admin`delete from student_guardian_relationships where tenant_id = ${tenantId}`;
      await admin`delete from guardian_profiles where tenant_id = ${tenantId}`;
      await admin`delete from exam_events where tenant_id = ${tenantId}`;
      await admin`delete from exam_corrections where tenant_id = ${tenantId}`;
      await admin`delete from exam_marks where tenant_id = ${tenantId}`;
      await admin`delete from exam_assessments where tenant_id = ${tenantId}`;
      await admin`delete from exams where tenant_id = ${tenantId}`;
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      for (const email of emails)
        await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    await app?.close();
  });

  const resultsBase = () => `/api/v1/results/schools/${schoolId}`;
  const resultPost = (path: string, body: object, auth = cookie) =>
    request(app.getHttpServer())
      .post(`${resultsBase()}${path}`)
      .set({ ...headers, Cookie: auth })
      .send(body);
  const resultGet = (path: string, auth = cookie) =>
    request(app.getHttpServer())
      .get(`${resultsBase()}${path}`)
      .set('Cookie', auth);
  const reportGet = (id: string, suffix = '', auth = cookie) =>
    request(app.getHttpServer())
      .get(`/api/v1/results/reports/${id}${suffix}`)
      .set('Cookie', auth);
  let examId: string,
    assessmentId: string,
    markId: string,
    policyId: string,
    batchId: string,
    reportId: string;
  it('validates authentication, CSRF, scoped permissions, and grade bands', async () => {
    expect(
      (await request(app.getHttpServer()).get('/api/v1/results/access')).status,
    ).toBe(401);
    expect((await resultGet('/setup', ordinaryCookie)).status).toBe(403);
    expect(
      (
        await request(app.getHttpServer())
          .post(`${resultsBase()}/policies`)
          .set('Cookie', cookie)
          .send({})
      ).status,
    ).toBe(403);
    const input = {
      name: 'School grades',
      bands: [
        { grade: 'A', minimumPercentage: 8000 },
        { grade: 'F', minimumPercentage: 0 },
      ],
      overallPassingPercentage: 3500,
      requireSubjectPass: true,
      idempotencyKey: randomUUID(),
    };
    expect((await resultPost('/policies', { ...input, tenantId })).status).toBe(
      400,
    );
    expect(
      (
        await resultPost('/policies', {
          ...input,
          bands: [
            { grade: 'A', minimumPercentage: 8000 },
            { grade: 'B', minimumPercentage: 6000 },
          ],
        })
      ).status,
    ).toBe(400);
    const policy = await resultPost('/policies', input);
    expect(policy.status, JSON.stringify(policy.body)).toBe(201);
    policyId = policy.body.id;
    expect((await resultPost('/policies', input)).body.id).toBe(policyId);
    expect(
      (
        await resultPost('/policies', {
          ...input,
          overallPassingPercentage: 4000,
        })
      ).status,
    ).toBe(409);
    const revision = await resultPost('/policies', {
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(revision.body.revision).toBe(2);
  });
  it('calculates reviewed marks with retry safety, stale writes, and separate approval', async () => {
    examId = (
      await post('/exams', {
        sessionId,
        classId,
        name: 'Results exam',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      })
    ).body.id;
    assessmentId = (
      await post(`/exams/${examId}/assessments`, {
        expectedVersion: 0,
        sectionId,
        subjectId,
        label: 'English written',
        assessmentDate: '2026-09-20',
        maximumScore: 10000,
        passingScore: 3500,
      })
    ).body.id;
    expect(
      (
        await resultPost('/batches', {
          examId,
          gradingPolicyId: policyId,
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    await post(`/exams/${examId}/lifecycle`, {
      expectedVersion: 1,
      action: 'open',
    });
    markId = (await get(`/assessments/${assessmentId}/sheet`)).body.marks[0].id;
    await request(app.getHttpServer())
      .put(`${base()}/assessments/${assessmentId}/marks`)
      .set({ ...headers, Cookie: cookie })
      .send({
        expectedVersion: 0,
        entries: [{ markId, status: 'scored', score: 7999 }],
      });
    await post(`/assessments/${assessmentId}/review`, {
      expectedVersion: 1,
      action: 'submit',
    });
    await post(
      `/assessments/${assessmentId}/review`,
      { expectedVersion: 2, action: 'lock' },
      reviewerCookie,
    );
    await post(`/exams/${examId}/lifecycle`, {
      expectedVersion: 2,
      action: 'complete',
    });
    const input = {
      examId,
      gradingPolicyId: policyId,
      idempotencyKey: randomUUID(),
    };
    const created = await resultPost('/batches', input);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    batchId = created.body.id;
    expect((await resultPost('/batches', input)).body.id).toBe(batchId);
    expect((await resultPost('/batches', input, reviewerCookie)).status).toBe(
      409,
    );
    const data = await resultGet(`/batches/${batchId}`);
    expect(data.body.sourceCurrent).toBe(true);
    reportId = data.body.reports[0].id;
    expect(data.body.reports[0].snapshot.overall).toMatchObject({
      percentage: 7999,
      grade: 'F',
      outcome: 'passed',
    });
    expect((await reportGet(reportId, '', studentCookie)).status).toBe(403);
    expect((await reportGet(reportId, '/pdf', guardianCookie)).status).toBe(
      403,
    );
    const save = (version: number, note: string, auth = cookie) =>
      request(app.getHttpServer())
        .put(`/api/v1/results/reports/${reportId}/remarks`)
        .set({ ...headers, Cookie: auth })
        .send({ expectedVersion: version, remarks: note });
    expect((await save(0, 'A reviewed staff remark')).status).toBe(200);
    expect((await save(0, 'Stale remark')).status).toBe(409);
    expect(
      (
        await resultPost(`/batches/${batchId}/lifecycle`, {
          expectedVersion: 1,
          action: 'submit',
        })
      ).body.status,
    ).toBe('submitted');
    expect(
      (
        await resultPost(`/batches/${batchId}/lifecycle`, {
          expectedVersion: 2,
          action: 'approve',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await resultPost(
          `/batches/${batchId}/lifecycle`,
          { expectedVersion: 2, action: 'approve' },
          reviewerCookie,
        )
      ).body.status,
    ).toBe('approved');
    expect((await save(3, 'Cannot mutate reviewed report')).status).toBe(409);
    const correction = await post(`/assessments/${assessmentId}/corrections`, {
      expectedVersion: 3,
      markId,
      status: 'scored',
      score: 8000,
      reason: 'Rechecked paper',
    });
    expect(correction.status).toBe(201);
    expect(
      (
        await resultPost(`/batches/${batchId}/lifecycle`, {
          expectedVersion: 3,
          action: 'publish',
        })
      ).status,
    ).toBe(409);
    await post(
      `/assessments/${assessmentId}/decisions`,
      {
        expectedVersion: 4,
        correctionId: correction.body.corrections[0].id,
        decision: 'approve',
        reason: 'Verified',
      },
      reviewerCookie,
    );
    expect(
      (
        await resultPost(
          `/batches/${batchId}/lifecycle`,
          {
            expectedVersion: 3,
            action: 'return',
            reason: 'Use corrected marks',
          },
          reviewerCookie,
        )
      ).body.status,
    ).toBe('draft');
    const competing = await Promise.all(
      [1, 2].map(() =>
        resultPost(`/batches/${batchId}/recalculate`, { expectedVersion: 4 }),
      ),
    );
    expect(competing.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const recalculated = await resultGet(`/batches/${batchId}`);
    expect(recalculated.body.reports[0].remarks).toBe(
      'A reviewed staff remark',
    );
    expect(recalculated.body.reports[0].snapshot.overall.grade).toBe('A');
    await resultPost(`/batches/${batchId}/lifecycle`, {
      expectedVersion: 5,
      action: 'submit',
    });
    await resultPost(
      `/batches/${batchId}/lifecycle`,
      { expectedVersion: 6, action: 'approve' },
      reviewerCookie,
    );
    expect(
      (
        await resultPost(`/batches/${batchId}/lifecycle`, {
          expectedVersion: 7,
          action: 'publish',
        })
      ).body.status,
    ).toBe('published');
  }, 20000);
  it('restricts current family reports, audits PDF exports, and immediately revokes relationship access', async () => {
    const studentView = await reportGet(reportId, '', studentCookie);
    expect(studentView.status).toBe(200);
    expect(studentView.headers['cache-control']).toBe('private, no-store');
    expect(studentView.body.batch.preparedByAccountId).toBeUndefined();
    expect(studentView.body.batch.requestChecksum).toBeUndefined();
    expect(
      studentView.body.report.snapshot.policy.actorAccountId,
    ).toBeUndefined();
    expect((await reportGet(reportId, '', guardianCookie)).status).toBe(200);
    expect((await reportGet(reportId, '', ordinaryCookie)).status).toBe(403);
    const pdf = await reportGet(reportId, '/pdf', guardianCookie);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['cache-control']).toBe('private, no-store');
    expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/results/my-report-cards')
          .set('Cookie', guardianCookie)
      ).body,
    ).toHaveLength(1);
    await admin`update student_guardian_relationships set portal_access=false where tenant_id=${tenantId} and student_id=${studentId}`;
    expect((await reportGet(reportId, '', guardianCookie)).status).toBe(403);
    expect((await reportGet(reportId, '/pdf', guardianCookie)).status).toBe(
      403,
    );
    await admin`update student_guardian_relationships set portal_access=true where tenant_id=${tenantId} and student_id=${studentId}`;
    await admin`update guardian_profiles set status='inactive' where id=${guardianId}`;
    expect((await reportGet(reportId, '', guardianCookie)).status).toBe(403);
    await admin`update guardian_profiles set status='active' where id=${guardianId}`;
    await admin`update student_profiles set membership_id=null where id=${studentId}`;
    expect((await reportGet(reportId, '', studentCookie)).status).toBe(403);
    const [member] =
      await admin`select id from memberships where tenant_id=${tenantId} and account_id=(select id from accounts where normalized_email=${emails[2]})`;
    await admin`update student_profiles set membership_id=${member.id} where id=${studentId}`;
    const history = await resultGet(`/batches/${batchId}`);
    expect(
      history.body.events.some(
        (e: { eventType: string }) => e.eventType === 'report_exported',
      ),
    ).toBe(true);
  });
  it('supersedes and withdraws publication atomically without exposing draft or older editions', async () => {
    const created = await resultPost('/batches', {
      examId,
      gradingPolicyId: policyId,
      idempotencyKey: randomUUID(),
    });
    const next = created.body.id;
    await resultPost(`/batches/${next}/lifecycle`, {
      expectedVersion: 0,
      action: 'submit',
    });
    await resultPost(
      `/batches/${next}/lifecycle`,
      { expectedVersion: 1, action: 'approve' },
      reviewerCookie,
    );
    expect(
      (
        await resultPost(`/batches/${next}/lifecycle`, {
          expectedVersion: 2,
          action: 'publish',
        })
      ).body.status,
    ).toBe('published');
    expect((await resultGet(`/batches/${batchId}`)).body.batch.status).toBe(
      'superseded',
    );
    expect((await reportGet(reportId, '', studentCookie)).status).toBe(403);
    const personal = await request(app.getHttpServer())
      .get('/api/v1/results/my-report-cards')
      .set('Cookie', studentCookie);
    expect(personal.body).toHaveLength(1);
    expect(personal.body[0].batch.id).toBe(next);
    expect(
      (
        await resultPost(`/batches/${next}/lifecycle`, {
          expectedVersion: 3,
          action: 'withdraw',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await resultPost(`/batches/${next}/lifecycle`, {
          expectedVersion: 3,
          action: 'withdraw',
          reason: 'School requested review',
        })
      ).body.status,
    ).toBe('withdrawn');
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/results/my-report-cards')
          .set('Cookie', studentCookie)
      ).body,
    ).toEqual([]);
    expect(
      (await reportGet(personal.body[0].report.id, '/pdf', guardianCookie))
        .status,
    ).toBe(403);
  });

  it('forces RLS, denies mismatched writes, and keeps reviewed snapshots and audits immutable', async () => {
    const restricted = postgres(process.env.DATABASE_URL!, { max: 1 });
    try {
      for (const table of [
        'result_batches',
        'result_reports',
        'result_events',
        'result_grading_policies',
      ])
        expect(await restricted`select * from ${restricted(table)}`).toEqual(
          [],
        );
      const run = (
        work: (tx: postgres.TransactionSql) => Promise<unknown>,
        tenant = tenantId,
      ) =>
        restricted.begin(async (tx) => {
          await tx`select set_config('app.tenant_id',${tenant},true)`;
          return work(tx);
        });
      expect(
        await run((tx) => tx`select * from result_reports`, randomUUID()),
      ).toEqual([]);
      await expect(
        run(
          (tx) =>
            tx`update result_reports set remarks='tampered' where id=${reportId}`,
        ),
      ).rejects.toBeTruthy();
      await expect(
        run((tx) => tx`delete from result_reports where id=${reportId}`),
      ).rejects.toBeTruthy();
      await expect(
        run((tx) => tx`update result_events set event_type='tampered'`),
      ).rejects.toBeTruthy();
      await expect(
        run((tx) => tx`update result_grading_policies set name='tampered'`),
      ).rejects.toBeTruthy();
      await expect(
        run(
          (tx) =>
            tx`insert into result_grading_policies(tenant_id,school_id,name,revision,bands,overall_passing_percentage,require_subject_pass,idempotency_key,actor_account_id,actor_membership_id) select ${randomUUID()},school_id,'mismatch',3,bands,0,true,${randomUUID()},actor_account_id,actor_membership_id from result_grading_policies where id=${policyId}`,
        ),
      ).rejects.toBeTruthy();
      await expect(
        run(
          (tx) =>
            tx`insert into result_grading_policies(tenant_id,school_id,name,revision,bands,overall_passing_percentage,require_subject_pass,idempotency_key,actor_account_id,actor_membership_id) select tenant_id,${randomUUID()},'bad scope',3,bands,0,true,${randomUUID()},actor_account_id,actor_membership_id from result_grading_policies where id=${policyId}`,
        ),
      ).rejects.toBeTruthy();
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/v1/results/schools/${randomUUID()}/batches/${batchId}`)
            .set('Cookie', cookie)
        ).status,
      ).toBe(403);
      await run((tx) => tx`select * from result_reports`);
      const policyCount = await run(
        (tx) => tx`select count(*) from result_grading_policies`,
      );
      await expect(
        run(async (tx) => {
          const temporaryPolicy = randomUUID();
          await tx`insert into result_grading_policies(id,tenant_id,school_id,name,revision,bands,overall_passing_percentage,require_subject_pass,idempotency_key,actor_account_id,actor_membership_id) select ${temporaryPolicy},tenant_id,school_id,'Rollback test',1,bands,3500,true,${randomUUID()},actor_account_id,actor_membership_id from result_grading_policies where id=${policyId}`;
          await tx`insert into result_events(tenant_id,school_id,policy_id,event_type,details,actor_account_id,actor_membership_id,request_id) select tenant_id,school_id,id,'test','{}'::jsonb,${randomUUID()},actor_membership_id,'rollback' from result_grading_policies where id=${temporaryPolicy}`;
        }),
      ).rejects.toBeTruthy();
      expect(
        await run((tx) => tx`select count(*) from result_grading_policies`),
      ).toEqual(policyCount);
      expect(await restricted`select * from result_reports`).toEqual([]);
    } finally {
      await restricted.end();
    }
  });
});
