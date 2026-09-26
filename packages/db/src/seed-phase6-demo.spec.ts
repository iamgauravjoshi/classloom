import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { buildPhase6DemoFixtures, parsePhase6SeedArgs, seedPhase6Demo } from './seed-phase6-demo.js';
import { createStudentProfile } from './students.js';
import { withTenantContext } from './tenant-context.js';

describe('Phase 6 demo seed safeguards', () => {
  it('requires explicit tenant and school and refuses production mode', () => {
    expect(() => parsePhase6SeedArgs([], 'development')).toThrow(/--tenant/i);
    expect(() => parsePhase6SeedArgs(['--tenant', 'demo-school-group'], 'development')).toThrow(/--school/i);
    expect(() => parsePhase6SeedArgs(['--tenant', 'demo-school-group', '--school', 'DEMO'], 'production')).toThrow(/production/i);
    expect(parsePhase6SeedArgs(['--', '--tenant', 'demo-school-group', '--school', 'DEMO', '--seed', '26092026'], 'development'))
      .toEqual({ tenant: 'demo-school-group', school: 'DEMO', seed: 26092026 });
  });

  it('builds bounded, repeatable Faker data with reserved codes and sibling guardians', () => {
    const first = buildPhase6DemoFixtures(26092026);
    const again = buildPhase6DemoFixtures(26092026);
    expect(first).toEqual(again);
    expect(first.students.length).toBeGreaterThanOrEqual(6);
    expect(first.students.length).toBeLessThanOrEqual(20);
    expect(first.students.every((student) => student.profile.studentCode.startsWith('DEMO-'))).toBe(true);
    expect(first.guardians.every((guardian) => guardian.guardianCode.startsWith('DEMO-'))).toBe(true);
    expect(first.students[0]!.guardianCodes).toEqual(first.students[1]!.guardianCodes);
    expect(first.students.map((student) => student.lifecycle)).toEqual(expect.arrayContaining(['active', 'transferred', 'withdrawn', 'completed']));
    expect(JSON.stringify(first)).not.toMatch(/password|invitation|credential/i);
  });

  it('uses a different deterministic data set for another seed', () => {
    expect(buildPhase6DemoFixtures(12345)).not.toEqual(buildPhase6DemoFixtures(26092026));
  });
});

const enabled = Boolean(process.env.DATABASE_PROVISIONER_URL && process.env.DATABASE_URL);

describe.skipIf(!enabled)('Phase 6 demo seed persistence', () => {
  const slug = `seed-phase6-${randomUUID()}`;
  const email = `seed-phase6-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let db: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let actorAccountId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    db = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const provisioned = await provisionTenant(db.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Seed School', schoolCode: 'SEED', timezone: 'UTC', currency: 'USD',
    });
    tenantId = provisioned.tenant.id;
    schoolId = provisioned.school.id;
    actorAccountId = (await createAccountWithMembership(db.db, { email, passwordHash: 'fixture-hash', tenantId })).id;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from student_academic_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_school_enrollments where tenant_id = ${tenantId}`;
      await admin`delete from student_guardian_relationships where tenant_id = ${tenantId}`;
      await admin`delete from guardian_profiles where tenant_id = ${tenantId}`;
      await admin`delete from student_profiles where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    await db?.close();
  });

  it('is idempotent, preserves a non-demo profile, and creates no credentials or invitations', async () => {
    const nonDemo = await withTenantContext(db.db, tenantId, (tx) => createStudentProfile(tx, tenantId, {
      studentCode: 'REAL-1', givenName: 'Real', familyName: 'Student', dateOfBirth: '2013-01-01',
    }, { actorAccountId }));
    const target = { tenant: slug, school: 'SEED', seed: 26092026 };
    const [before] = await admin<{ credentials: number; invitations: number }[]>`
      select (select count(*)::int from account_credentials where account_id = ${actorAccountId}) as credentials,
             (select count(*)::int from invitations where tenant_id = ${tenantId}) as invitations`;
    const first = await seedPhase6Demo(db.db, target);
    const second = await seedPhase6Demo(db.db, target);
    expect(first).toMatchObject({ tenantId, schoolId, createdStudents: 6, existingStudents: 0, createdGuardians: 4 });
    expect(second).toMatchObject({ createdStudents: 0, existingStudents: 6, createdGuardians: 0, existingGuardians: 4 });
    const [after] = await admin<{ credentials: number; invitations: number }[]>`
      select (select count(*)::int from account_credentials where account_id = ${actorAccountId}) as credentials,
             (select count(*)::int from invitations where tenant_id = ${tenantId}) as invitations`;
    expect(after).toEqual(before);
    const [real] = await admin<{ id: string; given_name: string }[]>`select id, given_name from student_profiles where tenant_id = ${tenantId} and student_code = 'REAL-1'`;
    expect(real).toEqual({ id: nonDemo.id, given_name: 'Real' });
    const [history] = await admin<{ status: string; count: number }[]>`
      select status, count(*)::int as count from student_academic_enrollments where tenant_id = ${tenantId} and status = 'transferred' group by status`;
    expect(history).toMatchObject({ status: 'transferred', count: 1 });
  });
});
