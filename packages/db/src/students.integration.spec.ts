import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { guardianProfiles, securityEvents, studentProfiles } from './schema.js';
import { createStaffProfile, linkStaffMembership } from './staff.js';
import {
  createGuardianProfile,
  createOrUpdateGuardianRelationship,
  createStudentProfile,
  linkGuardianMembership,
  linkStudentMembership,
  listGuardianStudents,
  listStudentGuardians,
  readStudentProfile,
  StudentPeopleError,
  unlinkGuardianMembership,
} from './students.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('student and guardian persistence', () => {
  const slug = `student-people-${randomUUID()}`;
  const otherSlug = `student-people-${randomUUID()}`;
  const actorEmail = `student-actor-${randomUUID()}@example.test`;
  const secondEmail = `student-second-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let otherTenantId: string;
  let schoolId: string;
  let actorAccountId: string;
  let actorMembershipId: string;
  let secondMembershipId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!, { maxConnections: 1 });
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const first = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Student School', schoolCode: 'STU', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const second = await provisionTenant(provisioner.db, {
      tenantName: otherSlug, tenantSlug: otherSlug, schoolName: 'Other School', schoolCode: 'OTH', timezone: 'UTC', currency: 'USD',
    });
    tenantId = first.tenant.id;
    otherTenantId = second.tenant.id;
    schoolId = first.school.id;
    const actor = await createAccountWithMembership(runtime.db, { email: actorEmail, passwordHash: 'fixture-hash', tenantId });
    actorAccountId = actor.id;
    actorMembershipId = actor.membershipId;
    secondMembershipId = (await createAccountWithMembership(runtime.db, { email: secondEmail, passwordHash: 'fixture-hash', tenantId })).membershipId;
    const [role] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${actorMembershipId}, ${role!.id}, 'tenant')`;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from tenants where slug in (${slug}, ${otherSlug})`;
      await admin`delete from accounts where normalized_email in (${actorEmail}, ${secondEmail})`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  it('normalizes unique tenant codes, isolates tenants, and writes non-PII audit metadata', async () => {
    const created = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const student = await createStudentProfile(tx, tenantId, {
        studentCode: ' stu-1 ', givenName: ' Asha ', familyName: ' Rao ', dateOfBirth: '2013-08-14', email: 'Asha@Example.Test',
      }, { actorAccountId, requestId: 'student-create' });
      const guardian = await createGuardianProfile(tx, tenantId, {
        guardianCode: ' gua-1 ', givenName: ' Ravi ', familyName: ' Rao ', phone: '+91 90000',
      }, { actorAccountId, requestId: 'guardian-create' });
      const relationship = await createOrUpdateGuardianRelationship(tx, tenantId, student.id, guardian.id, {
        relationshipType: 'father', primaryContact: true,
      }, { actorAccountId, requestId: 'relationship-create' });
      return { student, guardian, relationship };
    });
    expect(created.student).toMatchObject({ studentCode: 'STU-1', givenName: 'Asha', email: 'asha@example.test' });
    expect(created.guardian.guardianCode).toBe('GUA-1');
    expect(created.relationship.primaryContact).toBe(true);
    expect(await runtime.db.select().from(studentProfiles).where(eq(studentProfiles.id, created.student.id))).toEqual([]);
    await expect(withTenantContext(runtime.db, otherTenantId, (tx) => readStudentProfile(tx, otherTenantId, created.student.id))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const events = await runtime.db.select().from(securityEvents).where(and(eq(securityEvents.tenantId, tenantId), eq(securityEvents.requestId, 'student-create')));
    expect(events).toEqual([expect.objectContaining({ metadata: { studentId: created.student.id } })]);
    expect(JSON.stringify(events)).not.toContain('Asha');
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createStudentProfile(tx, tenantId, {
      studentCode: 'STU-1', givenName: 'Other', familyName: 'Student', dateOfBirth: '2012-01-01',
    }, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/code/i) } satisfies Partial<StudentPeopleError>);
  });

  it('reuses one guardian across siblings and rejects mismatched tenant relationships', async () => {
    await withTenantContext(runtime.db, tenantId, async (tx) => {
      const guardian = await createGuardianProfile(tx, tenantId, {
        guardianCode: 'GUA-SIB', givenName: 'Nina', familyName: 'Singh',
      }, { actorAccountId });
      const one = await createStudentProfile(tx, tenantId, {
        studentCode: 'SIB-1', givenName: 'Ira', familyName: 'Singh', dateOfBirth: '2012-01-01',
      }, { actorAccountId });
      const two = await createStudentProfile(tx, tenantId, {
        studentCode: 'SIB-2', givenName: 'Kabir', familyName: 'Singh', dateOfBirth: '2014-01-01',
      }, { actorAccountId });
      await createOrUpdateGuardianRelationship(tx, tenantId, one.id, guardian.id, { relationshipType: 'mother' }, { actorAccountId });
      await createOrUpdateGuardianRelationship(tx, tenantId, two.id, guardian.id, { relationshipType: 'mother' }, { actorAccountId });
      expect(await listGuardianStudents(tx, tenantId, guardian.id)).toHaveLength(2);
      expect(await listStudentGuardians(tx, tenantId, one.id)).toHaveLength(1);
      await expect(createOrUpdateGuardianRelationship(tx, tenantId, one.id, randomUUID(), { relationshipType: 'other' }, { actorAccountId }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  it('allows independent profile-type links and rejects inactive or same-type reuse', async () => {
    const scope = { tenantId, schoolId };
    const result = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const staff = await createStaffProfile(tx, scope, {
        profile: { staffCode: 'LINK-STF', givenName: 'Ravi', familyName: 'Rao' },
        affiliation: { designation: 'Administrator', kind: 'staff' },
      }, { actorAccountId });
      await linkStaffMembership(tx, scope, staff.id, actorMembershipId, { actorAccountId });
      const guardian = await createGuardianProfile(tx, tenantId, {
        guardianCode: 'LINK-GUA', givenName: 'Ravi', familyName: 'Rao',
      }, { actorAccountId });
      await linkGuardianMembership(tx, tenantId, guardian.id, actorMembershipId, { actorAccountId });
      const otherGuardian = await createGuardianProfile(tx, tenantId, {
        guardianCode: 'LINK-GUA-2', givenName: 'Other', familyName: 'Guardian',
      }, { actorAccountId });
      const student = await createStudentProfile(tx, tenantId, {
        studentCode: 'LINK-STU', givenName: 'Student', familyName: 'Rao', dateOfBirth: '2013-01-01',
      }, { actorAccountId });
      return { guardian, otherGuardian, student };
    });
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkGuardianMembership(tx, tenantId, result.otherGuardian.id, actorMembershipId, { actorAccountId })))
      .rejects.toMatchObject({ code: 'CONFLICT' });
    await withTenantContext(runtime.db, tenantId, (tx) => unlinkGuardianMembership(tx, tenantId, result.guardian.id, { actorAccountId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkGuardianMembership(tx, tenantId, result.guardian.id, secondMembershipId, { actorAccountId })))
      .rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/history/i) });
    await admin`update memberships set status = 'disabled' where id = ${secondMembershipId}`;
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkStudentMembership(tx, tenantId, result.student.id, secondMembershipId, { actorAccountId })))
      .rejects.toMatchObject({ code: 'INVALID', message: expect.stringMatching(/active/i) });
    await admin`update memberships set status = 'active' where id = ${secondMembershipId}`;
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkStudentMembership(tx, tenantId, result.student.id, secondMembershipId, { actorAccountId })))
      .resolves.toMatchObject({ membershipId: secondMembershipId });
  });

  it('does not leak tenant context through a reused pooled connection', async () => {
    const first = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(studentProfiles));
    const other = await withTenantContext(runtime.db, otherTenantId, (tx) => tx.select().from(studentProfiles));
    const firstAgain = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(guardianProfiles));
    expect(first.length).toBeGreaterThan(0);
    expect(other).toEqual([]);
    expect(firstAgain.length).toBeGreaterThan(0);
  });
});
