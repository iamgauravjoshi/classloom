import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { createAcademicAssignment, createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject } from './academics.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { academicTeacherAssignments, securityEvents, staffProfiles } from './schema.js';
import {
  addStaffAffiliation, createStaffProfile, isAssignableTeacher, linkStaffMembership,
  listEligibleStaffAccounts, listSchoolStaff, readSchoolStaff, StaffError,
  unlinkStaffMembership, updateStaffAffiliation, updateStaffProfile, upsertTeacherProfile,
} from './staff.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('staff directory persistence', () => {
  const slug = `staff-directory-${randomUUID()}`;
  const otherSlug = `staff-directory-${randomUUID()}`;
  const actorEmail = `staff-actor-${randomUUID()}@example.test`;
  const otherActorEmail = `staff-actor-${randomUUID()}@example.test`;
  const noGrantEmail = `staff-no-grant-${randomUUID()}@example.test`;
  const secondSchoolId = randomUUID();
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let otherTenantId: string;
  let actorAccountId: string;
  let actorMembershipId: string;
  let noGrantMembershipId: string;
  let otherActorAccountId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!);
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const one = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Directory One', schoolCode: 'D1', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const two = await provisionTenant(provisioner.db, {
      tenantName: otherSlug, tenantSlug: otherSlug, schoolName: 'Directory Two', schoolCode: 'D2', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = one.tenant.id;
    schoolId = one.school.id;
    otherTenantId = two.tenant.id;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${secondSchoolId}, ${tenantId}, 'Second Campus School', 'D3', 'UTC', 'USD')`;
    const actor = await createAccountWithMembership(runtime.db, { email: actorEmail, passwordHash: 'fixture-hash', tenantId });
    actorAccountId = actor.id;
    actorMembershipId = actor.membershipId;
    otherActorAccountId = (await createAccountWithMembership(runtime.db, { email: otherActorEmail, passwordHash: 'fixture-hash', tenantId: otherTenantId })).id;
    noGrantMembershipId = (await createAccountWithMembership(runtime.db, { email: noGrantEmail, passwordHash: 'fixture-hash', tenantId })).membershipId;
    const [role] = await admin<{ id: string }[]>`select id from authorization_roles where tenant_id = ${tenantId} and system_key = 'tenant_admin'`;
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${actorMembershipId}, ${role!.id}, 'tenant')`;
  });

  afterAll(async () => {
    if (admin) { await admin`delete from tenants where slug in (${slug}, ${otherSlug})`; await admin`delete from accounts where normalized_email in (${actorEmail}, ${otherActorEmail}, ${noGrantEmail})`; await admin.end(); }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  it('creates a teacher once, lists only the selected school, and audits the commit', async () => {
    const created = await withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, { tenantId, schoolId }, {
      profile: { staffCode: 'MATH-1', givenName: ' Priya ', familyName: ' Sharma ', workEmail: 'Priya@Example.Test' },
      affiliation: { designation: 'Mathematics Teacher', kind: 'teacher', startDate: '2026-04-01' },
      teacher: { specialization: 'Mathematics' },
    }, { actorAccountId, requestId: 'staff-create-test' }));
    expect(created).toMatchObject({ staffCode: 'MATH-1', givenName: 'Priya', workEmail: 'priya@example.test', kind: 'teacher', specialization: 'Mathematics' });
    expect((await withTenantContext(runtime.db, tenantId, (tx) => listSchoolStaff(tx, { tenantId, schoolId }, { q: 'priya' }))).items).toEqual([expect.objectContaining({ id: created.id })]);
    expect((await withTenantContext(runtime.db, tenantId, (tx) => listSchoolStaff(tx, { tenantId, schoolId: secondSchoolId }, {}))).items).toEqual([]);
    expect((await withTenantContext(runtime.db, tenantId, (tx) => readSchoolStaff(tx, { tenantId, schoolId }, created.id))).id).toBe(created.id);
    expect(await runtime.db.select().from(staffProfiles).where(eq(staffProfiles.id, created.id))).toEqual([]);
    const events = await runtime.db.select().from(securityEvents).where(and(eq(securityEvents.tenantId, tenantId), eq(securityEvents.requestId, 'staff-create-test')));
    expect(events).toEqual([expect.objectContaining({ eventType: 'staff_created' })]);
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, { tenantId, schoolId }, {
      profile: { staffCode: ' math-1 ', givenName: 'Other', familyName: 'Teacher' },
      affiliation: { designation: 'Teacher', kind: 'staff' },
    }, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringMatching(/code/i) } satisfies Partial<StaffError>);
    const foreignSchool = await admin<{ id: string }[]>`select id from schools where tenant_id = ${otherTenantId} limit 1`;
    const otherTenantProfile = await withTenantContext(runtime.db, otherTenantId, (tx) => createStaffProfile(tx, { tenantId: otherTenantId, schoolId: foreignSchool[0]!.id }, {
      profile: { staffCode: 'MATH-1', givenName: 'Another', familyName: 'Teacher' },
      affiliation: { designation: 'Teacher', kind: 'staff' },
    }, { actorAccountId: otherActorAccountId }));
    expect(otherTenantProfile.staffCode).toBe('MATH-1');
    await withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, { tenantId, schoolId }, {
      profile: { staffCode: 'MATH-2', givenName: 'Asha', familyName: 'Sharma' },
      affiliation: { designation: 'Teacher', kind: 'teacher' },
    }, { actorAccountId }));
    const firstPage = await withTenantContext(runtime.db, tenantId, (tx) => listSchoolStaff(tx, { tenantId, schoolId }, { limit: 1 }));
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    const secondPage = await withTenantContext(runtime.db, tenantId, (tx) => listSchoolStaff(tx, { tenantId, schoolId }, { limit: 1, cursor: firstPage.nextCursor! }));
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]!.id).not.toBe(firstPage.items[0]!.id);
  });

  it('rolls back a creation when the school is outside the tenant', async () => {
    const foreignSchoolId = randomUUID();
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, { tenantId, schoolId: foreignSchoolId }, {
      profile: { staffCode: 'FAIL-1', givenName: 'Failing', familyName: 'Person' },
      affiliation: { designation: 'Teacher', kind: 'teacher' },
    }, { actorAccountId, requestId: 'staff-failed-create' }))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(staffProfiles).where(and(eq(staffProfiles.tenantId, tenantId), eq(staffProfiles.staffCode, 'FAIL-1'))))).toEqual([]);
    expect(await runtime.db.select().from(securityEvents).where(eq(securityEvents.requestId, 'staff-failed-create'))).toEqual([]);
    expect((await withTenantContext(runtime.db, otherTenantId, (tx) => listSchoolStaff(tx, { tenantId: otherTenantId, schoolId }, {}))).items).toEqual([]);
  });

  it('links an eligible teacher across schools and enforces affiliation status', async () => {
    const scope = { tenantId, schoolId };
    const person = await withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, scope, {
      profile: { staffCode: 'LINK-1', givenName: 'Meera', familyName: 'Patel' },
      affiliation: { designation: 'Teacher', kind: 'teacher' },
    }, { actorAccountId }));
    expect((await withTenantContext(runtime.db, tenantId, (tx) => listEligibleStaffAccounts(tx, scope))).map((item) => item.id)).toContain(actorMembershipId);
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkStaffMembership(tx, scope, person.id, noGrantMembershipId, { actorAccountId }))).rejects.toMatchObject({ code: 'INVALID' });
    const linked = await withTenantContext(runtime.db, tenantId, (tx) => linkStaffMembership(tx, scope, person.id, actorMembershipId, { actorAccountId }));
    expect(linked.membershipId).toBe(actorMembershipId);
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(true);
    await admin`update accounts set status = 'disabled' where normalized_email = ${actorEmail}`;
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(false);
    await admin`update accounts set status = 'active' where normalized_email = ${actorEmail}`;
    await admin`update memberships set status = 'disabled' where id = ${actorMembershipId}`;
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(false);
    await admin`update memberships set status = 'active' where id = ${actorMembershipId}`;
    const [grant] = await admin<{ id: string }[]>`delete from membership_role_assignments where tenant_id = ${tenantId} and membership_id = ${actorMembershipId} returning role_id as id`;
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(false);
    await admin`insert into membership_role_assignments (tenant_id, membership_id, role_id, scope_kind) values (${tenantId}, ${actorMembershipId}, ${grant!.id}, 'tenant')`;
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(true);
    await withTenantContext(runtime.db, tenantId, (tx) => addStaffAffiliation(tx, scope, secondSchoolId, person.id, { designation: 'Visiting Teacher', kind: 'teacher' }, { actorAccountId }));
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, { tenantId, schoolId: secondSchoolId }, actorMembershipId))).toBe(true);
    await withTenantContext(runtime.db, tenantId, (tx) => updateStaffAffiliation(tx, scope, person.id, { status: 'inactive' }, { actorAccountId }));
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(false);
    await withTenantContext(runtime.db, tenantId, (tx) => updateStaffAffiliation(tx, scope, person.id, { status: 'active' }, { actorAccountId }));
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(true);
    expect((await withTenantContext(runtime.db, tenantId, (tx) => listEligibleStaffAccounts(tx, scope))).map((item) => item.id)).not.toContain(actorMembershipId);
    const edited = await withTenantContext(runtime.db, tenantId, (tx) => updateStaffProfile(tx, scope, person.id, { preferredName: 'Mia' }, { actorAccountId }));
    expect(edited.preferredName).toBe('Mia');
    const teacher = await withTenantContext(runtime.db, tenantId, (tx) => upsertTeacherProfile(tx, scope, person.id, { specialization: 'Physics' }, { actorAccountId }));
    expect(teacher.specialization).toBe('Physics');
    const qualified = await withTenantContext(runtime.db, tenantId, (tx) => upsertTeacherProfile(tx, scope, person.id, { qualification: 'MSc' }, { actorAccountId }));
    expect(qualified).toMatchObject({ qualification: 'MSc', specialization: 'Physics' });
    const session = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSession(tx, scope, {
      name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31',
    }));
    const klass = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, scope, session.id, { name: 'Grade 8', code: 'G8' }));
    const section = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSection(tx, scope, klass.id, { name: 'Section A', code: 'A' }));
    const subject = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSubject(tx, scope, session.id, { name: 'Mathematics', code: 'MATH' }));
    const assignment = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicAssignment(tx, scope, section.id, { subjectId: subject.id, membershipId: actorMembershipId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => unlinkStaffMembership(tx, scope, person.id, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT' });
    await withTenantContext(runtime.db, tenantId, (tx) => tx.delete(academicTeacherAssignments).where(and(eq(academicTeacherAssignments.tenantId, tenantId), eq(academicTeacherAssignments.id, assignment.id))));
    await withTenantContext(runtime.db, tenantId, (tx) => unlinkStaffMembership(tx, scope, person.id, { actorAccountId }));
    expect(await withTenantContext(runtime.db, tenantId, (tx) => isAssignableTeacher(tx, scope, actorMembershipId))).toBe(false);
  });

  it('rejects duplicate school affiliations, membership links, and foreign staff IDs', async () => {
    const scope = { tenantId, schoolId };
    const one = await withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, scope, {
      profile: { staffCode: 'EDGE-1', givenName: 'Rina', familyName: 'Kapoor' },
      affiliation: { designation: 'Teacher', kind: 'staff' },
    }, { actorAccountId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => addStaffAffiliation(tx, scope, schoolId, one.id, { designation: 'Teacher', kind: 'staff' }, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(withTenantContext(runtime.db, tenantId, (tx) => updateStaffAffiliation(tx, scope, one.id, { kind: 'teacher' }, { actorAccountId }))).rejects.toMatchObject({ code: 'INVALID' });
    await withTenantContext(runtime.db, tenantId, (tx) => updateStaffAffiliation(tx, scope, one.id, { status: 'inactive' }, { actorAccountId }));
    await admin`update accounts set status = 'disabled' where normalized_email = ${noGrantEmail}`;
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkStaffMembership(tx, scope, one.id, noGrantMembershipId, { actorAccountId }))).rejects.toMatchObject({ code: 'INVALID' });
    await admin`update accounts set status = 'active' where normalized_email = ${noGrantEmail}`;
    await withTenantContext(runtime.db, tenantId, (tx) => updateStaffAffiliation(tx, scope, one.id, { status: 'active' }, { actorAccountId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkStaffMembership(tx, scope, one.id, actorMembershipId, { actorAccountId }))).resolves.toMatchObject({ membershipId: actorMembershipId });
    const two = await withTenantContext(runtime.db, tenantId, (tx) => createStaffProfile(tx, scope, {
      profile: { staffCode: 'EDGE-2', givenName: 'Sana', familyName: 'Khan' },
      affiliation: { designation: 'Teacher', kind: 'staff' },
    }, { actorAccountId }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => linkStaffMembership(tx, scope, two.id, actorMembershipId, { actorAccountId }))).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(withTenantContext(runtime.db, tenantId, (tx) => readSchoolStaff(tx, scope, randomUUID()))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
