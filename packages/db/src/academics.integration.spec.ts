import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { provisionTenant } from './provisioning.js';
import { withTenantContext } from './tenant-context.js';
import { academicSessions } from './schema.js';
import { activateAcademicSession, createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject, readAcademicSetup } from './academics.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('academic setup tenant isolation', () => {
  const slug = `academic-${randomUUID()}`;
  const otherSlug = `academic-${randomUUID()}`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let otherTenantId: string;
  const secondarySchoolId = randomUUID();

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!);
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const one = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'School One', schoolCode: 'ONE', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const two = await provisionTenant(provisioner.db, {
      tenantName: otherSlug, tenantSlug: otherSlug, schoolName: 'School Two', schoolCode: 'TWO', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = one.tenant.id;
    schoolId = one.school.id;
    otherTenantId = two.tenant.id;
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${secondarySchoolId}, ${tenantId}, 'Second School', 'SECOND', 'UTC', 'USD')`;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from tenants where slug in (${slug}, ${otherSlug})`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  it('creates setup, requires prerequisites, and activates one session', async () => {
    const scope = { tenantId, schoolId };
    const session = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSession(tx, scope, {
      name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2027-03-31',
    }));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => activateAcademicSession(tx, scope, session.id))).rejects.toThrow('Add a class');
    const klass = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, scope, session.id, { name: 'Grade 1', code: 'G1' }));
    await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSection(tx, scope, klass.id, { name: 'Section A', code: 'A' }));
    await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSubject(tx, scope, session.id, { name: 'Mathematics', code: 'MATH' }));
    expect((await withTenantContext(runtime.db, tenantId, (tx) => activateAcademicSession(tx, scope, session.id)))?.status).toBe('active');
    const second = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSession(tx, scope, {
      name: '2027–28', code: '2027', startDate: '2027-04-01', endDate: '2028-03-31',
    }));
    const nextClass = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, scope, second.id, { name: 'Grade 1', code: 'G1' }));
    await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSection(tx, scope, nextClass.id, { name: 'Section A', code: 'A' }));
    await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSubject(tx, scope, second.id, { name: 'Mathematics', code: 'MATH' }));
    await withTenantContext(runtime.db, tenantId, (tx) => activateAcademicSession(tx, scope, second.id));
    const setup = await withTenantContext(runtime.db, tenantId, (tx) => readAcademicSetup(tx, scope));
    expect(setup.sessions.find((item) => item.id === session.id)?.status).toBe('archived');
    expect(setup.sessions.find((item) => item.id === second.id)?.status).toBe('active');
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createAcademicSubject(tx, scope, session.id, { name: 'Science', code: 'SCI' }))).rejects.toThrow('Archived');
  });

  it('does not expose another tenant and rejects a cross-school reference', async () => {
    await expect(withTenantContext(runtime.db, otherTenantId, (tx) => readAcademicSetup(tx, { tenantId: otherTenantId, schoolId }))).rejects.toThrow('School was not found');
    await expect(withTenantContext(runtime.db, otherTenantId, (tx) => createAcademicSession(tx, { tenantId: otherTenantId, schoolId }, {
      name: 'Wrong school', code: 'WRONG', startDate: '2026-04-01', endDate: '2027-03-31',
    }))).rejects.toThrow('School was not found');
    const primary = await withTenantContext(runtime.db, tenantId, (tx) => readAcademicSetup(tx, { tenantId, schoolId }));
    const otherSchool = await withTenantContext(runtime.db, tenantId, (tx) => readAcademicSetup(tx, { tenantId, schoolId: secondarySchoolId }));
    expect(otherSchool.sessions).toEqual([]);
    await expect(withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, { tenantId, schoolId: secondarySchoolId }, primary.sessions[0]!.id, { name: 'Grade 1', code: 'G1' }))).rejects.toThrow('Academic session was not found');
    expect(await runtime.db.select().from(academicSessions).where(eq(academicSessions.id, primary.sessions[0]!.id))).toEqual([]);
  });
});
