import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { staffProfiles, staffSchoolAffiliations, teacherProfiles } from './schema.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('staff schema tenant isolation', () => {
  const slug = `staff-schema-${randomUUID()}`;
  const otherSlug = `staff-schema-${randomUUID()}`;
  const foreignEmail = `staff-schema-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let otherTenantId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!);
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const one = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Staff Schema One', schoolCode: 'SS1', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const two = await provisionTenant(provisioner.db, {
      tenantName: otherSlug, tenantSlug: otherSlug, schoolName: 'Staff Schema Two', schoolCode: 'SS2', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = one.tenant.id;
    schoolId = one.school.id;
    otherTenantId = two.tenant.id;
  });

  afterAll(async () => {
    if (admin) { await admin`delete from tenants where slug in (${slug}, ${otherSlug})`; await admin`delete from accounts where normalized_email = ${foreignEmail}`; await admin.end(); }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  it('enforces staff code uniqueness and tenant-scoped school references', async () => {
    const [staff] = await withTenantContext(runtime.db, tenantId, (tx) => tx.insert(staffProfiles).values({
      tenantId, staffCode: 'AB-12', givenName: 'Priya', familyName: 'Sharma',
    }).returning());
    expect(staff?.id).toBeTruthy();
    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(staffProfiles).values({
      tenantId, staffCode: ' ab-12 ', givenName: 'Other', familyName: 'Teacher',
    }))).rejects.toThrow();
    const [affiliation] = await withTenantContext(runtime.db, tenantId, (tx) => tx.insert(staffSchoolAffiliations).values({
      tenantId, schoolId, staffId: staff!.id, designation: 'Teacher', kind: 'teacher',
    }).returning());
    expect(affiliation?.schoolId).toBe(schoolId);
    const [teacher] = await withTenantContext(runtime.db, tenantId, (tx) => tx.insert(teacherProfiles).values({
      tenantId, staffId: staff!.id, specialization: 'Mathematics',
    }).returning());
    expect(teacher?.specialization).toBe('Mathematics');
    await expect(withTenantContext(runtime.db, otherTenantId, (tx) => tx.insert(staffSchoolAffiliations).values({
      tenantId: otherTenantId, schoolId, staffId: staff!.id, designation: 'Teacher', kind: 'teacher',
    }))).rejects.toThrow();
    const foreignAccount = await createAccountWithMembership(runtime.db, {
      email: foreignEmail, passwordHash: 'fixture-hash', tenantId: otherTenantId,
    });
    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(staffProfiles).values({
      tenantId, staffCode: 'OTH-13', givenName: 'Foreign', familyName: 'Account', membershipId: foreignAccount.membershipId,
    }))).rejects.toThrow();
    expect(await runtime.db.select().from(staffProfiles).where(eq(staffProfiles.id, staff!.id))).toEqual([]);
  });
});
