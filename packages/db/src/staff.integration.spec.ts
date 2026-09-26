import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { securityEvents, staffProfiles } from './schema.js';
import { createStaffProfile, listSchoolStaff, readSchoolStaff, StaffError } from './staff.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('staff directory persistence', () => {
  const slug = `staff-directory-${randomUUID()}`;
  const otherSlug = `staff-directory-${randomUUID()}`;
  const actorEmail = `staff-actor-${randomUUID()}@example.test`;
  const otherActorEmail = `staff-actor-${randomUUID()}@example.test`;
  const secondSchoolId = randomUUID();
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let otherTenantId: string;
  let actorAccountId: string;
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
    actorAccountId = (await createAccountWithMembership(runtime.db, { email: actorEmail, passwordHash: 'fixture-hash', tenantId })).id;
    otherActorAccountId = (await createAccountWithMembership(runtime.db, { email: otherActorEmail, passwordHash: 'fixture-hash', tenantId: otherTenantId })).id;
  });

  afterAll(async () => {
    if (admin) { await admin`delete from tenants where slug in (${slug}, ${otherSlug})`; await admin`delete from accounts where normalized_email in (${actorEmail}, ${otherActorEmail})`; await admin.end(); }
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
});
