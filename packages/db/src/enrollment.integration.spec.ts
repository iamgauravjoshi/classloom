import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAcademicClass,
  createAcademicSection,
  createAcademicSession,
  resolveEnrollmentPlacement,
} from './academics.js';
import { createDb } from './client.js';
import {
  completeAcademicEnrollment,
  createAcademicEnrollment,
  createSchoolEnrollment,
  EnrollmentError,
  listAcademicEnrollmentHistory,
  transferAcademicEnrollment,
  withdrawAcademicEnrollment,
} from './enrollment.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { studentAcademicEnrollments, studentSchoolEnrollments } from './schema.js';
import { createStudentProfile } from './students.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('student enrollment persistence', () => {
  const slug = `enrollment-${randomUUID()}`;
  const actorEmail = `enrollment-actor-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let actorAccountId: string;
  let sessionId: string;
  let classId: string;
  let sectionOneId: string;
  let sectionTwoId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!, { maxConnections: 6 });
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const provisioned = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Enrollment School', schoolCode: 'ENR', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = provisioned.tenant.id;
    schoolId = provisioned.school.id;
    actorAccountId = (await createAccountWithMembership(runtime.db, { email: actorEmail, passwordHash: 'fixture-hash', tenantId })).id;
    const academic = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const session = await createAcademicSession(tx, { tenantId, schoolId }, {
        name: '2026–27', code: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
      });
      const klass = await createAcademicClass(tx, { tenantId, schoolId }, session.id, { name: 'Grade 8', code: 'G8' });
      const one = await createAcademicSection(tx, { tenantId, schoolId }, klass.id, { name: 'Section A', code: 'A' });
      const two = await createAcademicSection(tx, { tenantId, schoolId }, klass.id, { name: 'Section B', code: 'B' });
      return { session, klass, one, two };
    });
    sessionId = academic.session.id;
    classId = academic.klass.id;
    sectionOneId = academic.one.id;
    sectionTwoId = academic.two.id;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_guardian_relationships where tenant_id = ${tenantId}`;
      await admin`delete from guardian_profiles where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from tenants where slug = ${slug}`;
      await admin`delete from accounts where normalized_email = ${actorEmail}`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  async function student(code: string) {
    return withTenantContext(runtime.db, tenantId, (tx) => createStudentProfile(tx, tenantId, {
      studentCode: code, givenName: 'Test', familyName: code, dateOfBirth: '2013-01-01',
    }, { actorAccountId }));
  }

  it('validates hierarchy and archived sessions and preserves transfer history', async () => {
    const person = await student('HISTORY-1');
    const scope = { tenantId, schoolId };
    const initial = await withTenantContext(runtime.db, tenantId, async (tx) => {
      await expect(resolveEnrollmentPlacement(tx, scope, { sessionId, classId: randomUUID(), sectionId: sectionOneId }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
      const school = await createSchoolEnrollment(tx, scope, person.id, { admissionNumber: 'ADM-HISTORY', admissionDate: '2026-04-01' }, { actorAccountId });
      const placement = await resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionOneId });
      const academic = await createAcademicEnrollment(tx, scope, school.id, placement, { rollNumber: '8-A-01', startDate: '2026-04-01' }, { actorAccountId });
      return { school, academic };
    });
    const moved = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const placement = await resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionTwoId });
      return transferAcademicEnrollment(tx, scope, initial.academic.id, placement, {
        rollNumber: '8-B-01', startDate: '2026-08-01', reason: 'Section change',
      }, { actorAccountId });
    });
    expect(moved).toMatchObject({ status: 'active', sectionId: sectionTwoId });
    const history = await withTenantContext(runtime.db, tenantId, (tx) => listAcademicEnrollmentHistory(tx, scope, initial.school.id));
    expect(history).toEqual([
      expect.objectContaining({ id: initial.academic.id, status: 'transferred', endDate: '2026-08-01', sectionId: sectionOneId }),
      expect.objectContaining({ id: moved.id, status: 'active', sectionId: sectionTwoId }),
    ]);

    const archivedSession = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSession(tx, scope, {
      name: 'Archived', code: 'ARCHIVED', startDate: '2025-04-01', endDate: '2026-03-31',
    }));
    const archivedClass = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, scope, archivedSession.id, { name: 'Grade 7', code: 'G7' }));
    const archivedSection = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSection(tx, scope, archivedClass.id, { name: 'Section A', code: 'A' }));
    await admin`update academic_sessions set status = 'archived' where id = ${archivedSession.id}`;
    await expect(withTenantContext(runtime.db, tenantId, (tx) => resolveEnrollmentPlacement(tx, scope, {
      sessionId: archivedSession.id, classId: archivedClass.id, sectionId: archivedSection.id,
    }))).rejects.toMatchObject({ code: 'NOT_FOUND', message: expect.stringMatching(/draft or active/i) });
  });

  it('reports admission and active roll-number conflicts clearly', async () => {
    const one = await student('CONFLICT-1');
    const two = await student('CONFLICT-2');
    const scope = { tenantId, schoolId };
    const firstSchool = await withTenantContext(runtime.db, tenantId, (tx) => createSchoolEnrollment(tx, scope, one.id, {
      admissionNumber: 'ADM-CONFLICT', admissionDate: '2026-04-01',
    }, { actorAccountId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createSchoolEnrollment(tx, scope, two.id, {
      admissionNumber: 'adm-conflict', admissionDate: '2026-04-01',
    }, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/admission/i) });
    const secondSchool = await withTenantContext(runtime.db, tenantId, (tx) => createSchoolEnrollment(tx, scope, two.id, {
      admissionNumber: 'ADM-CONFLICT-2', admissionDate: '2026-04-01',
    }, { actorAccountId }));
    const placement = await withTenantContext(runtime.db, tenantId, (tx) => resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionOneId }));
    await withTenantContext(runtime.db, tenantId, (tx) => createAcademicEnrollment(tx, scope, firstSchool.id, placement, {
      rollNumber: 'ROLL-DUP', startDate: '2026-04-01',
    }, { actorAccountId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createAcademicEnrollment(tx, scope, secondSchool.id, placement, {
      rollNumber: 'roll-dup', startDate: '2026-04-01',
    }, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/roll number/i) });
  });

  it('closes placement and school history for withdrawal and completion', async () => {
    const scope = { tenantId, schoolId };
    for (const [code, status] of [['WITHDRAW-1', 'withdrawn'], ['COMPLETE-1', 'completed']] as const) {
      const person = await student(code);
      const created = await withTenantContext(runtime.db, tenantId, async (tx) => {
        const school = await createSchoolEnrollment(tx, scope, person.id, { admissionNumber: `ADM-${code}`, admissionDate: '2026-04-01' }, { actorAccountId });
        const placement = await resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionOneId });
        const academic = await createAcademicEnrollment(tx, scope, school.id, placement, { startDate: '2026-04-01' }, { actorAccountId });
        return { school, academic };
      });
      const closed = await withTenantContext(runtime.db, tenantId, (tx) => status === 'withdrawn'
        ? withdrawAcademicEnrollment(tx, scope, created.academic.id, { effectiveDate: '2026-09-01', reason: 'Moved away' }, { actorAccountId })
        : completeAcademicEnrollment(tx, scope, created.academic.id, { effectiveDate: '2027-03-31' }, { actorAccountId }));
      expect(closed.status).toBe(status);
      const [school] = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(studentSchoolEnrollments).where(eq(studentSchoolEnrollments.id, created.school.id)));
      expect(school).toMatchObject({ status, leavingDate: status === 'withdrawn' ? '2026-09-01' : '2027-03-31' });
    }
  });

  it('serializes concurrent initial enrollments and transfers', async () => {
    const scope = { tenantId, schoolId };
    const initialStudent = await student('RACE-INITIAL');
    const initialAttempts = await Promise.allSettled([
      withTenantContext(runtime.db, tenantId, (tx) => createSchoolEnrollment(tx, scope, initialStudent.id, { admissionNumber: 'RACE-I-1', admissionDate: '2026-04-01' }, { actorAccountId })),
      withTenantContext(runtime.db, tenantId, (tx) => createSchoolEnrollment(tx, scope, initialStudent.id, { admissionNumber: 'RACE-I-2', admissionDate: '2026-04-01' }, { actorAccountId })),
    ]);
    expect(initialAttempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(initialAttempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    const activeSchools = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(studentSchoolEnrollments).where(and(
      eq(studentSchoolEnrollments.studentId, initialStudent.id), eq(studentSchoolEnrollments.status, 'active'),
    )));
    expect(activeSchools).toHaveLength(1);

    const transferStudent = await student('RACE-TRANSFER');
    const current = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const school = await createSchoolEnrollment(tx, scope, transferStudent.id, { admissionNumber: 'RACE-T', admissionDate: '2026-04-01' }, { actorAccountId });
      const placement = await resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionOneId });
      return createAcademicEnrollment(tx, scope, school.id, placement, { startDate: '2026-04-01' }, { actorAccountId });
    });
    const placementOne = await withTenantContext(runtime.db, tenantId, (tx) => resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionTwoId }));
    const placementTwo = await withTenantContext(runtime.db, tenantId, (tx) => resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId: sectionOneId }));
    const transferAttempts = await Promise.allSettled([
      withTenantContext(runtime.db, tenantId, (tx) => transferAcademicEnrollment(tx, scope, current.id, placementOne, { startDate: '2026-08-01' }, { actorAccountId })),
      withTenantContext(runtime.db, tenantId, (tx) => transferAcademicEnrollment(tx, scope, current.id, placementTwo, { startDate: '2026-08-02' }, { actorAccountId })),
    ]);
    expect(transferAttempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(transferAttempts.filter((attempt) => attempt.status === 'rejected' && attempt.reason instanceof EnrollmentError)).toHaveLength(1);
    const activePlacements = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(studentAcademicEnrollments).where(and(
      eq(studentAcademicEnrollments.studentId, transferStudent.id), eq(studentAcademicEnrollments.status, 'active'),
    )));
    expect(activePlacements).toHaveLength(1);
  });
});
