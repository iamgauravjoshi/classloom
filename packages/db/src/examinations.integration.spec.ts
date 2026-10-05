import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject } from './academics.js';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { createStudentProfile } from './students.js';
import { createAcademicEnrollment, createSchoolEnrollment } from './enrollment.js';
import { exams, examAssessments, examMarks, examCorrections, examEvents } from './schema.js';
import { addAssessment, completeExam, createExam, decideExamCorrection, openExam, readExamSheet, requestExamCorrection, saveExamMarks, transitionExamSheet } from './examinations.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);
describe.skipIf(!enabled)('examination persistence and boundaries', () => {
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string, schoolId: string, sessionId: string, classId: string, sectionId: string, subjectId: string, academicEnrollmentId: string;
  let accountId: string, membershipId: string, reviewerId: string, reviewerMembershipId: string;
  const emails = [`exam-${randomUUID()}@example.test`, `reviewer-${randomUUID()}@example.test`];
  const scope = () => ({ tenantId, schoolId });
  const actor = () => ({ accountId, membershipId, requestId: randomUUID() });
  const reviewer = () => ({ accountId: reviewerId, membershipId: reviewerMembershipId, requestId: randomUUID() });
  const run = <T>(work: Parameters<typeof withTenantContext<T>>[2]) => withTenantContext(runtime.db, tenantId, work);
  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!, { maxConnections: 6 });
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const p = await provisionTenant(provisioner.db, { tenantName: 'Exam tests', tenantSlug: `exam-${randomUUID()}`, schoolName: 'Exam School', schoolCode: 'EXAM', timezone: 'UTC', currency: 'USD' });
    tenantId = p.tenant.id; schoolId = p.school.id;
    const first = await createAccountWithMembership(runtime.db, { email: emails[0], passwordHash: 'fixture', tenantId });
    const second = await createAccountWithMembership(runtime.db, { email: emails[1], passwordHash: 'fixture', tenantId });
    accountId = first.id; membershipId = first.membershipId; reviewerId = second.id; reviewerMembershipId = second.membershipId;
    await run(async (tx) => {
      const session = await createAcademicSession(tx, scope(), { name: '2026', code: '2026', startDate: '2026-01-01', endDate: '2026-12-31' }); sessionId = session.id;
      const klass = await createAcademicClass(tx, scope(), sessionId, { name: 'Grade 1', code: 'G1' }); classId = klass.id;
      const section = await createAcademicSection(tx, scope(), classId, { name: 'Section A', code: 'A' }); sectionId = section.id;
      const subject = await createAcademicSubject(tx, scope(), sessionId, { name: 'English', code: 'ENG' }); subjectId = subject.id;
      const student = await createStudentProfile(tx, tenantId, { studentCode: 'EX-1', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2018-03-04' }, { actorAccountId: accountId, requestId: 'fixture' });
      const enrollment = await createSchoolEnrollment(tx, scope(), student.id, { admissionNumber: 'EX-ADM-1', admissionDate: '2026-01-01' }, { actorAccountId: accountId, requestId: 'fixture' });
      const academic = await createAcademicEnrollment(tx, scope(), enrollment.id, { sessionId, classId, sectionId, sessionName: session.name, sessionStartDate: session.startDate, sessionEndDate: session.endDate, sessionStatus: 'active', className: klass.name, sectionName: section.name }, { startDate: '2026-01-01', rollNumber: '1' }, { actorAccountId: accountId, requestId: 'fixture' });
      academicEnrollmentId = academic.id;
    });
  });
  afterAll(async () => {
    if (admin) {
      if (tenantId) {
        await admin`delete from exam_events where tenant_id = ${tenantId}`;
        await admin`delete from exam_corrections where tenant_id = ${tenantId}`;
        await admin`delete from exam_marks where tenant_id = ${tenantId}`;
        await admin`delete from exam_assessments where tenant_id = ${tenantId}`;
        await admin`delete from exams where tenant_id = ${tenantId}`;
        await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
        await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
        await admin`delete from student_profiles where tenant_id = ${tenantId}`;
        await admin`delete from tenants where id = ${tenantId}`;
      }
      await admin`delete from accounts where normalized_email in (${emails[0]}, ${emails[1]})`;
      await admin.end();
    }
    await runtime?.close(); await provisioner?.close();
  });
  async function fixture(open = true) {
    return run(async (tx) => {
      let exam = await createExam(tx, scope(), { sessionId, classId, name: randomUUID(), startDate: '2026-09-01', endDate: '2026-09-30' }, actor());
      const assessment = await addAssessment(tx, scope(), exam.id, { expectedVersion: 0, sectionId, subjectId, label: 'English paper', assessmentDate: '2026-09-20', maximumScore: 10000, passingScore: 3500 }, actor());
      if (open) exam = await openExam(tx, scope(), exam.id, 1, new Map([[assessment.id, [{ academicEnrollmentId, studentId: randomUUID(), displayName: 'Asha Rao', rollNumber: '1' }]]]), actor());
      return readExamSheet(tx, scope(), assessment.id);
    });
  }
  it('snapshots roster, enforces review states, and applies a correction only by a second account', async () => {
    const initial = await fixture(); const id = initial.assessment.id;
    expect(initial.marks[0].displayName).toBe('Asha Rao');
    await expect(run((tx) => transitionExamSheet(tx, scope(), id, 0, 'submit', undefined, actor()))).rejects.toThrow('every student');
    let sheet = await run((tx) => saveExamMarks(tx, scope(), id, 0, [{ markId: initial.marks[0].id, status: 'scored', score: 0 }], actor()));
    sheet = await run((tx) => transitionExamSheet(tx, scope(), id, sheet.assessment.version, 'submit', undefined, actor()));
    sheet = await run((tx) => transitionExamSheet(tx, scope(), id, sheet.assessment.version, 'return', 'Recheck the script', reviewer()));
    expect(sheet.assessment.status).toBe('draft');
    sheet = await run((tx) => transitionExamSheet(tx, scope(), id, sheet.assessment.version, 'submit', undefined, actor()));
    sheet = await run((tx) => transitionExamSheet(tx, scope(), id, sheet.assessment.version, 'lock', undefined, reviewer()));
    await expect(run((tx) => saveExamMarks(tx, scope(), id, sheet.assessment.version, [{ markId: initial.marks[0].id, status: 'absent', score: null }], actor()))).rejects.toThrow('draft sheet');
    sheet = await run((tx) => requestExamCorrection(tx, scope(), id, sheet.assessment.version, initial.marks[0].id, { status: 'scored', score: 7550, reason: 'Missed second page' }, actor()));
    expect(sheet.marks[0].score).toBe(0);
    await expect(run((tx) => completeExam(tx, scope(), initial.exam.id, initial.exam.version, actor()))).rejects.toThrow('pending corrections');
    await expect(run((tx) => decideExamCorrection(tx, scope(), id, sheet.assessment.version, sheet.corrections[0].id, 'approve', 'Checked', actor()))).rejects.toThrow('Another authorized account');
    sheet = await run((tx) => decideExamCorrection(tx, scope(), id, sheet.assessment.version, sheet.corrections[0].id, 'approve', 'Verified script', reviewer()));
    expect(sheet.marks[0]).toMatchObject({ score: 7550, revision: 2 });
    expect(sheet.corrections[0].status).toBe('approved');
    expect(sheet.events.map((e) => e.eventType)).toContain('correction_approve');
    expect((await run((tx) => completeExam(tx, scope(), initial.exam.id, initial.exam.version, actor()))).status).toBe('completed');
    sheet = await run((tx) => requestExamCorrection(tx, scope(), id, sheet.assessment.version, initial.marks[0].id, { status: 'exempt', score: null, reason: 'Check exemption' }, actor()));
    sheet = await run((tx) => decideExamCorrection(tx, scope(), id, sheet.assessment.version, sheet.corrections[1].id, 'reject', 'No exemption applies', reviewer()));
    expect(sheet.marks[0].score).toBe(7550);
    expect(sheet.corrections[1].status).toBe('rejected');
  });
  it('serializes competing saves with one stale conflict and rolls back marks and audit together', async () => {
    const initial = await fixture(); const id = initial.assessment.id, markId = initial.marks[0].id;
    const saves = await Promise.allSettled([10, 20].map((score) => run((tx) => saveExamMarks(tx, scope(), id, 0, [{ markId, status: 'scored', score }], actor()))));
    expect(saves.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(saves.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const before = await run((tx) => readExamSheet(tx, scope(), id));
    await expect(run(async (tx) => {
      await saveExamMarks(tx, scope(), id, before.assessment.version, [{ markId, status: 'absent', score: null }], actor());
      throw new Error('rollback');
    })).rejects.toThrow('rollback');
    const after = await run((tx) => readExamSheet(tx, scope(), id));
    expect(after.marks).toEqual(before.marks); expect(after.events).toEqual(before.events);
    await expect(run((tx) => saveExamMarks(tx, scope(), id, after.assessment.version, [], actor()))).rejects.toThrow('complete roster');
    await expect(run((tx) => saveExamMarks(tx, scope(), id, after.assessment.version, [{ markId, status: 'scored', score: 10001 }], actor()))).rejects.toThrow('assessment maximum');
  });
  it('rejects empty opening atomically and fixes configuration once opened', async () => {
    const initial = await fixture(false);
    await expect(run((tx) => openExam(tx, scope(), initial.exam.id, initial.exam.version, new Map(), actor()))).rejects.toThrow('nonempty');
    expect((await run((tx) => readExamSheet(tx, scope(), initial.assessment.id))).marks).toEqual([]);
    const open = await fixture();
    await expect(run((tx) => addAssessment(tx, scope(), open.exam.id, { expectedVersion: open.exam.version, sectionId, subjectId, label: 'New', assessmentDate: '2026-09-21', maximumScore: 10000, passingScore: 3500 }, actor()))).rejects.toThrow('draft');
  });
  it('forces tenant isolation, scoped references, numeric checks, and immutable history', async () => {
    const initial = await fixture();
    for (const table of [exams, examAssessments, examMarks, examCorrections, examEvents]) expect(await runtime.db.select().from(table)).toEqual([]);
    expect(await withTenantContext(runtime.db, randomUUID(), (tx) => tx.select().from(exams).where(eq(exams.id, initial.exam.id)))).toEqual([]);
    const forbiddenExam = { ...scope(), sessionId, classId, name: 'Blocked insertion', startDate: '2026-09-01', endDate: '2026-09-30' };
    await expect(runtime.db.insert(exams).values(forbiddenExam)).rejects.toBeTruthy();
    await expect(withTenantContext(runtime.db, randomUUID(), (tx) => tx.insert(exams).values(forbiddenExam))).rejects.toBeTruthy();
    expect(await withTenantContext(runtime.db, randomUUID(), (tx) => tx.update(examMarks).set({ score: 100 }).where(eq(examMarks.id, initial.marks[0].id)).returning())).toEqual([]);
    await expect(run((tx) => readExamSheet(tx, { tenantId, schoolId: randomUUID() }, initial.assessment.id))).rejects.toThrow('not found');
    await expect(run((tx) => tx.update(examMarks).set({ status: 'scored', score: null }).where(eq(examMarks.id, initial.marks[0].id)))).rejects.toBeTruthy();
    await expect(run((tx) => tx.update(examMarks).set({ assessmentId: randomUUID() }).where(eq(examMarks.id, initial.marks[0].id)))).rejects.toBeTruthy();
    await expect(run((tx) => tx.update(examEvents).set({ eventType: 'tampered' }).where(eq(examEvents.examId, initial.exam.id)))).rejects.toBeTruthy();
    await expect(run((tx) => tx.delete(examEvents).where(eq(examEvents.examId, initial.exam.id)))).rejects.toBeTruthy();
  });
});
