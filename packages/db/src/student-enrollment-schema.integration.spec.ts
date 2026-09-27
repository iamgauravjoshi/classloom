import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAcademicClass, createAcademicSection, createAcademicSession } from './academics.js';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import {
  guardianProfiles,
  studentAcademicEnrollments,
  studentGuardianRelationships,
  studentImportBatches,
  studentProfiles,
  studentSchoolEnrollments,
} from './schema.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('student and enrollment schema isolation', () => {
  const slug = `student-schema-${randomUUID()}`;
  const otherSlug = `student-schema-${randomUUID()}`;
  const actorEmail = `student-schema-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let otherTenantId: string;
  let actorAccountId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!);
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const primary = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Student Schema One', schoolCode: 'ST1', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const other = await provisionTenant(provisioner.db, {
      tenantName: otherSlug, tenantSlug: otherSlug, schoolName: 'Student Schema Two', schoolCode: 'ST2', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = primary.tenant.id;
    schoolId = primary.school.id;
    otherTenantId = other.tenant.id;
    actorAccountId = (await createAccountWithMembership(runtime.db, {
      email: actorEmail, passwordHash: 'fixture-hash', tenantId,
    })).id;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from student_import_batches where tenant_id in (select id from tenants where slug in (${slug}, ${otherSlug}))`;
      await admin`delete from student_academic_enrollments where tenant_id in (select id from tenants where slug in (${slug}, ${otherSlug}))`;
      await admin`delete from student_school_enrollments where tenant_id in (select id from tenants where slug in (${slug}, ${otherSlug}))`;
      await admin`delete from tenants where slug in (${slug}, ${otherSlug})`;
      await admin`delete from accounts where normalized_email = ${actorEmail}`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  it('enforces codes, relationships, active placements, and RLS', async () => {
    const created = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const [student] = await tx.insert(studentProfiles).values({
        tenantId, studentCode: 'STU-001', givenName: 'Aarav', familyName: 'Sharma', dateOfBirth: '2014-06-10',
      }).returning();
      const [guardian] = await tx.insert(guardianProfiles).values({
        tenantId, guardianCode: 'GUA-001', givenName: 'Meera', familyName: 'Sharma', phone: '+919876543210',
      }).returning();
      const [relationship] = await tx.insert(studentGuardianRelationships).values({
        tenantId, studentId: student!.id, guardianId: guardian!.id, relationshipType: 'mother', primaryContact: true,
      }).returning();
      const [schoolEnrollment] = await tx.insert(studentSchoolEnrollments).values({
        tenantId, schoolId, studentId: student!.id, admissionNumber: 'ADM-001', admissionDate: '2026-04-01',
      }).returning();
      const session = await createAcademicSession(tx, { tenantId, schoolId }, { name: '2026–27', code: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' });
      const academicClass = await createAcademicClass(tx, { tenantId, schoolId }, session!.id, { name: 'Grade 6', code: 'G6' });
      const section = await createAcademicSection(tx, { tenantId, schoolId }, academicClass!.id, { name: 'Section A', code: 'A', capacity: 40 });
      const [placement] = await tx.insert(studentAcademicEnrollments).values({
        tenantId, schoolId, studentId: student!.id, schoolEnrollmentId: schoolEnrollment!.id,
        sessionId: session!.id, classId: academicClass!.id, sectionId: section!.id, rollNumber: '12', startDate: '2026-04-01',
      }).returning();
      const [batch] = await tx.insert(studentImportBatches).values({
        tenantId, schoolId, actorAccountId, idempotencyKey: randomUUID(), payloadChecksum: 'a'.repeat(64), status: 'completed', studentCount: 1,
      }).returning();
      return { student: student!, guardian: guardian!, relationship: relationship!, schoolEnrollment: schoolEnrollment!, placement: placement!, batch: batch! };
    });

    expect(created.relationship.primaryContact).toBe(true);
    expect(created.placement.status).toBe('active');
    expect(created.batch.studentCount).toBe(1);

    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(studentProfiles).values({
      tenantId, studentCode: ' stu-001 ', givenName: 'Other', familyName: 'Student', dateOfBirth: '2014-06-11',
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(studentSchoolEnrollments).values({
      tenantId, schoolId, studentId: created.student.id, admissionNumber: 'adm-001', admissionDate: '2026-04-02', status: 'withdrawn',
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(studentAcademicEnrollments).values({
      tenantId, schoolId, studentId: created.student.id, schoolEnrollmentId: created.schoolEnrollment.id,
      sessionId: created.placement.sessionId, classId: created.placement.classId, sectionId: created.placement.sectionId,
      rollNumber: '13', startDate: '2026-04-02',
    }))).rejects.toThrow();
    await expect(withTenantContext(runtime.db, otherTenantId, (tx) => tx.insert(studentGuardianRelationships).values({
      tenantId: otherTenantId, studentId: created.student.id, guardianId: created.guardian.id, relationshipType: 'other',
    }))).rejects.toThrow();

    expect(await runtime.db.select().from(studentProfiles).where(eq(studentProfiles.id, created.student.id))).toEqual([]);
  });
});
