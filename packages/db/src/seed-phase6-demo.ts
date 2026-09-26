import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { faker } from '@faker-js/faker';
import { and, eq } from 'drizzle-orm';
import { createAcademicClass, createAcademicSection, createAcademicSession, resolveEnrollmentPlacement } from './academics.js';
import { createDb, type AppDb, type TenantTransaction } from './client.js';
import {
  completeAcademicEnrollment, createAcademicEnrollment, createSchoolEnrollment, transferAcademicEnrollment, withdrawAcademicEnrollment,
} from './enrollment.js';
import { accounts, academicClasses, academicSections, academicSessions, memberships, schools, tenants } from './schema.js';
import { createGuardianProfile, createOrUpdateGuardianRelationship, createStudentProfile, findGuardianByCode, findStudentByCode } from './students.js';
import { withTenantContext } from './tenant-context.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Phase6SeedTarget = { tenant: string; school: string; seed: number };

export function parsePhase6SeedArgs(args: string[], nodeEnv: string | undefined): Phase6SeedTarget {
  if (nodeEnv === 'production') throw new Error('The Phase 6 demo seeder refuses production mode');
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: { tenant: { type: 'string' }, school: { type: 'string' }, seed: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const tenant = values.tenant?.trim();
  const school = values.school?.trim();
  if (!tenant) throw new Error('--tenant is required');
  if (!school) throw new Error('--school is required');
  const seed = values.seed === undefined ? 26092026 : Number(values.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('--seed must be a non-negative integer');
  return { tenant, school, seed };
}

export type Phase6DemoFixtures = ReturnType<typeof buildPhase6DemoFixtures>;

export function buildPhase6DemoFixtures(seed: number) {
  faker.seed(seed);
  const guardians = Array.from({ length: 4 }, (_, index) => ({
    guardianCode: `DEMO-G${String(index + 1).padStart(2, '0')}`,
    givenName: faker.person.firstName(),
    familyName: faker.person.lastName(),
    email: `demo.guardian.${index + 1}@example.test`,
    occupation: faker.person.jobTitle(),
  }));
  const lifecycles = ['active', 'active', 'transferred', 'withdrawn', 'completed', 'active'] as const;
  const students = lifecycles.map((lifecycle, index) => ({
    lifecycle,
    profile: {
      studentCode: `DEMO-S${String(index + 1).padStart(2, '0')}`,
      givenName: faker.person.firstName(),
      familyName: index < 2 ? guardians[0]!.familyName : faker.person.lastName(),
      dateOfBirth: `${2011 + index}-0${index % 7 + 1}-15`,
    },
    admissionNumber: `DEMO-A${String(index + 1).padStart(2, '0')}`,
    rollNumber: `DEMO-R${String(index + 1).padStart(2, '0')}`,
    guardianCodes: index < 2 ? [guardians[0]!.guardianCode] : [guardians[(index - 1) % guardians.length]!.guardianCode],
  }));
  return { guardians, students };
}

async function resolveTarget(db: AppDb, target: Phase6SeedTarget) {
  const [tenant] = await db.select().from(tenants).where(uuidPattern.test(target.tenant)
    ? eq(tenants.id, target.tenant) : eq(tenants.slug, target.tenant)).limit(1);
  if (!tenant) throw new Error('Target tenant was not found');
  const [school] = await db.select().from(schools).where(and(
    eq(schools.tenantId, tenant.id),
    uuidPattern.test(target.school) ? eq(schools.id, target.school) : eq(schools.code, target.school.toUpperCase()),
  )).limit(1);
  if (!school) throw new Error('Target school was not found in that tenant');
  const [actor] = await db.select({ accountId: accounts.id }).from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.status, 'active'), eq(accounts.status, 'active')))
    .limit(1);
  if (!actor) throw new Error('Target tenant needs an active account membership for audit attribution');
  return { tenantId: tenant.id, schoolId: school.id, actorAccountId: actor.accountId };
}

async function ensureAcademicSetup(tx: TenantTransaction, scope: { tenantId: string; schoolId: string }) {
  const [existingSession] = await tx.select().from(academicSessions).where(and(
    eq(academicSessions.tenantId, scope.tenantId), eq(academicSessions.schoolId, scope.schoolId), eq(academicSessions.code, 'DEMO-2026'),
  )).limit(1);
  const session = existingSession ?? await createAcademicSession(tx, scope, {
    name: 'Demo Academic Year 2026–27', code: 'DEMO-2026', startDate: '2026-04-01', endDate: '2027-03-31',
  });
  if (session.status === 'archived') throw new Error('Demo academic session is archived; choose another target school');
  const [existingClass] = await tx.select().from(academicClasses).where(and(
    eq(academicClasses.tenantId, scope.tenantId), eq(academicClasses.schoolId, scope.schoolId),
    eq(academicClasses.sessionId, session.id), eq(academicClasses.code, 'DEMO-G8'),
  )).limit(1);
  const klass = existingClass ?? await createAcademicClass(tx, scope, session.id, { name: 'Demo Grade 8', code: 'DEMO-G8' });
  const sections = [];
  for (const [name, code] of [['Demo Section A', 'DEMO-A'], ['Demo Section B', 'DEMO-B']] as const) {
    const [existingSection] = await tx.select().from(academicSections).where(and(
      eq(academicSections.tenantId, scope.tenantId), eq(academicSections.schoolId, scope.schoolId),
      eq(academicSections.sessionId, session.id), eq(academicSections.classId, klass.id), eq(academicSections.code, code),
    )).limit(1);
    sections.push(existingSection ?? await createAcademicSection(tx, scope, klass.id, { name, code }));
  }
  const [first, second] = await Promise.all(sections.map((section) => resolveEnrollmentPlacement(tx, scope, {
    sessionId: session.id, classId: klass.id, sectionId: section.id,
  })));
  return { first: first!, second: second! };
}

export async function seedPhase6Demo(db: AppDb, target: Phase6SeedTarget) {
  if (process.env.NODE_ENV === 'production') throw new Error('The Phase 6 demo seeder refuses production mode');
  const resolved = await resolveTarget(db, target);
  const fixtures = buildPhase6DemoFixtures(target.seed);
  return withTenantContext(db, resolved.tenantId, async (tx) => {
    const scope = { tenantId: resolved.tenantId, schoolId: resolved.schoolId };
    const audit = { actorAccountId: resolved.actorAccountId };
    const placement = await ensureAcademicSetup(tx, scope);
    const guardianByCode = new Map<string, string>();
    let createdGuardians = 0;
    let existingGuardians = 0;
    for (const fixture of fixtures.guardians) {
      let guardian = await findGuardianByCode(tx, scope.tenantId, fixture.guardianCode);
      if (guardian) {
        if (guardian.givenName !== fixture.givenName || guardian.familyName !== fixture.familyName) {
          throw new Error(`Reserved demo guardian code ${fixture.guardianCode} already belongs to a different profile`);
        }
        existingGuardians += 1;
      } else {
        guardian = await createGuardianProfile(tx, scope.tenantId, fixture, audit);
        createdGuardians += 1;
      }
      guardianByCode.set(fixture.guardianCode, guardian.id);
    }

    let createdStudents = 0;
    let existingStudents = 0;
    for (const fixture of fixtures.students) {
      const existing = await findStudentByCode(tx, scope.tenantId, fixture.profile.studentCode);
      if (existing) {
        if (existing.givenName !== fixture.profile.givenName || existing.familyName !== fixture.profile.familyName ||
          existing.dateOfBirth !== fixture.profile.dateOfBirth) {
          throw new Error(`Reserved demo student code ${fixture.profile.studentCode} already belongs to a different profile`);
        }
        existingStudents += 1;
        continue;
      }
      const student = await createStudentProfile(tx, scope.tenantId, fixture.profile, audit);
      createdStudents += 1;
      for (const guardianCode of fixture.guardianCodes) {
        await createOrUpdateGuardianRelationship(tx, scope.tenantId, student.id, guardianByCode.get(guardianCode)!, {
          relationshipType: 'legal_guardian', primaryContact: true, emergencyContact: true,
          authorizedPickup: true, financialResponsibility: true,
        }, audit);
      }
      const schoolEnrollment = await createSchoolEnrollment(tx, scope, student.id, {
        admissionNumber: fixture.admissionNumber, admissionDate: '2026-04-01',
      }, audit);
      const academic = await createAcademicEnrollment(tx, scope, schoolEnrollment.id, placement.first, {
        rollNumber: fixture.rollNumber, startDate: '2026-04-01',
      }, audit);
      if (fixture.lifecycle === 'transferred') {
        await transferAcademicEnrollment(tx, scope, academic.id, placement.second, {
          rollNumber: `${fixture.rollNumber}-B`, startDate: '2026-08-01', reason: 'Demo section transfer',
        }, audit);
      } else if (fixture.lifecycle === 'withdrawn') {
        await withdrawAcademicEnrollment(tx, scope, academic.id, {
          effectiveDate: '2026-08-15', reason: 'Demo withdrawal',
        }, audit);
      } else if (fixture.lifecycle === 'completed') {
        await completeAcademicEnrollment(tx, scope, academic.id, {
          effectiveDate: '2027-03-31', reason: 'Demo completion',
        }, audit);
      }
    }
    return { ...scope, seed: target.seed, createdStudents, existingStudents, createdGuardians, existingGuardians };
  });
}

async function run() {
  try {
    const target = parsePhase6SeedArgs(process.argv.slice(2), process.env.NODE_ENV);
    const databaseUrl = process.env.DATABASE_PROVISIONER_URL;
    if (!databaseUrl) throw new Error('DATABASE_PROVISIONER_URL is required');
    const { db, close } = createDb(databaseUrl);
    try {
      const result = await seedPhase6Demo(db, target);
      console.log(`Phase 6 demo seed complete: ${result.createdStudents} students created, ${result.existingStudents} existing; ${result.createdGuardians} guardians created, ${result.existingGuardians} existing`);
    } finally { await close(); }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 6 demo seed failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
