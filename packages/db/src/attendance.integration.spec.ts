import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAcademicClass, createAcademicSection, createAcademicSession } from './academics.js';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { createStudentProfile } from './students.js';
import { createAcademicEnrollment, createSchoolEnrollment } from './enrollment.js';
import { dailyAttendanceEntries, dailyAttendanceEvents, dailyAttendanceRegisters } from './schema.js';
import { saveDailyAttendance, readDailyAttendance, listDailyAttendanceEvents } from './attendance.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('daily attendance persistence and tenant isolation', () => {
  const slug = `attendance-${randomUUID()}`;
  const email = `attendance-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let accountId: string;
  let membershipId: string;
  let sessionId: string;
  let classId: string;
  let sectionId: string;
  let academicEnrollmentId: string;
  let studentId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!, { maxConnections: 6 });
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const provisioned = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Attendance School', schoolCode: 'ATT', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = provisioned.tenant.id;
    schoolId = provisioned.school.id;
    const member = await createAccountWithMembership(runtime.db, { email, passwordHash: 'fixture-hash', tenantId });
    accountId = member.id;
    membershipId = member.membershipId;
    await withTenantContext(runtime.db, tenantId, async (tx) => {
      const session = await createAcademicSession(tx, { tenantId, schoolId }, {
        name: '2026–27', code: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31',
      });
      sessionId = session.id;
      const academicClass = await createAcademicClass(tx, { tenantId, schoolId }, sessionId, { name: 'Grade 1', code: 'G1' });
      classId = academicClass.id;
      const section = await createAcademicSection(tx, { tenantId, schoolId }, classId, { name: 'Section A', code: 'A' });
      sectionId = section.id;
      const student = await createStudentProfile(tx, tenantId, {
        studentCode: 'ATT-001', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2018-03-04',
      }, { actorAccountId: accountId, requestId: 'attendance-fixture' });
      studentId = student.id;
      const schoolEnrollment = await createSchoolEnrollment(tx, { tenantId, schoolId }, studentId, {
        admissionNumber: 'ATT-ADM-001', admissionDate: '2026-04-01',
      }, { actorAccountId: accountId, requestId: 'attendance-fixture' });
      const placement = {
        sessionId, classId, sectionId, sessionName: '2026–27', sessionStartDate: '2026-04-01', sessionEndDate: '2027-03-31',
        sessionStatus: 'active', className: 'Grade 1', sectionName: 'Section A',
      };
      const enrollment = await createAcademicEnrollment(tx, { tenantId, schoolId }, schoolEnrollment.id, placement, {
        startDate: '2026-04-01', rollNumber: '1',
      }, { actorAccountId: accountId, requestId: 'attendance-fixture' });
      academicEnrollmentId = enrollment.id;
    });
  });

  afterAll(async () => {
    if (admin) {
      if (tenantId) {
        await admin`delete from daily_attendance_events where tenant_id = ${tenantId}`;
        await admin`delete from daily_attendance_entries where tenant_id = ${tenantId}`;
        await admin`delete from daily_attendance_registers where tenant_id = ${tenantId}`;
        await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
        await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
        await admin`delete from student_profiles where tenant_id = ${tenantId}`;
        await admin`delete from tenants where id = ${tenantId}`;
      }
      if (email) await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  const scope = () => ({ tenantId, schoolId });
  const roster = () => [{ academicEnrollmentId, studentId, rollNumber: '1', displayName: 'Asha Rao' }];
  const actor = () => ({ accountId, membershipId, requestId: `attendance-${randomUUID()}` });
  const input = (status: 'present' | 'absent' | 'late' | 'excused', date = '2026-09-28') => ({
    sessionId, sectionId, date, entries: [{ academicEnrollmentId, status }],
  });

  it('saves a complete register and retains immutable correction history', async () => {
    const created = await withTenantContext(runtime.db, tenantId, (tx) => saveDailyAttendance(tx, scope(), input('present'), roster(), actor()));
    const registerId = created.register?.id;
    expect(registerId).toBeTruthy();
    if (!registerId) throw new Error('The saved attendance register was not returned');
    const corrected = await withTenantContext(runtime.db, tenantId, (tx) => saveDailyAttendance(tx, scope(), input('late'), roster(), actor()));
    expect(corrected.register?.id).toBe(registerId);
    expect(corrected.completion).toMatchObject({ total: 1, late: 1, unmarked: 0, complete: true });
    const events = await withTenantContext(runtime.db, tenantId, (tx) => listDailyAttendanceEvents(tx, scope(), registerId));
    expect(events.map(({ previousStatus, status }) => [previousStatus, status])).toEqual([[null, 'present'], ['present', 'late']]);
  });

  it('hides rows without tenant context and rolls back status and audit together', async () => {
    const saved = await withTenantContext(runtime.db, tenantId, (tx) => saveDailyAttendance(tx, scope(), input('present'), roster(), actor()));
    const registerId = saved.register?.id;
    expect(registerId).toBeTruthy();
    if (!registerId) throw new Error('The saved attendance register was not returned');
    const beforeEvents = await withTenantContext(runtime.db, tenantId, (tx) => listDailyAttendanceEvents(tx, scope(), registerId));
    await expect(withTenantContext(runtime.db, tenantId, async (tx) => {
      await saveDailyAttendance(tx, scope(), input('absent'), roster(), actor());
      throw new Error('rollback attendance correction');
    })).rejects.toThrow('rollback attendance correction');
    const after = await withTenantContext(runtime.db, tenantId, (tx) => readDailyAttendance(tx, scope(), {
      sessionId, sectionId, date: '2026-09-28',
    }, roster()));
    expect(after.entries[0]?.status).toBe('present');
    expect(await runtime.db.select().from(dailyAttendanceRegisters).where(eq(dailyAttendanceRegisters.id, registerId))).toEqual([]);
    const afterEvents = await withTenantContext(runtime.db, tenantId, (tx) => listDailyAttendanceEvents(tx, scope(), registerId));
    expect(afterEvents).toHaveLength(beforeEvents.length);
  });

  it('serializes concurrent saves and records each actual status transition once', async () => {
    await Promise.all([
      withTenantContext(runtime.db, tenantId, (tx) => saveDailyAttendance(tx, scope(), input('present', '2026-09-27'), roster(), actor())),
      withTenantContext(runtime.db, tenantId, (tx) => saveDailyAttendance(tx, scope(), input('absent', '2026-09-27'), roster(), actor())),
    ]);
    const register = await withTenantContext(runtime.db, tenantId, (tx) => readDailyAttendance(tx, scope(), {
      sessionId, sectionId, date: '2026-09-27',
    }, roster()));
    expect(['present', 'absent']).toContain(register.entries[0]?.status);
    expect(register.completion.complete).toBe(true);
    const registerId = register.register?.id;
    expect(registerId).toBeTruthy();
    if (!registerId) throw new Error('The saved attendance register was not returned');
    expect(await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(dailyAttendanceEntries)
      .where(eq(dailyAttendanceEntries.registerId, registerId)))).toHaveLength(1);
    expect(await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(dailyAttendanceEvents)
      .where(eq(dailyAttendanceEvents.registerId, registerId)))).toHaveLength(2);
  });
});
