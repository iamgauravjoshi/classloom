import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { afterAll, beforeAll } from 'vitest';
import { createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject } from './academics.js';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { buildPhase8DemoFixtures, parsePhase8SeedArgs, seedPhase8Demo } from './seed-phase8-demo.js';
import { weeklyTimetableSlots } from './schema.js';
import { insertTimetableSlot, lockOrCreateWeeklyTimetable } from './timetable.js';
import { withTenantContext } from './tenant-context.js';

const sections = [
  { id: 'section-a', label: 'Grade 8 · A' },
  { id: 'section-b', label: 'Grade 8 · B' },
];
const subjects = [{ id: 'subject-math', name: 'Mathematics', code: 'MATH' }];
const assignments = [{ id: 'assignment-a', sectionId: 'section-a', subjectId: 'subject-math', membershipId: 'teacher-a' }];

describe('Phase 8 timetable demo seed safeguards', () => {
  it('requires an explicit tenant, school, and session and refuses production mode', () => {
    expect(() => parsePhase8SeedArgs([], 'development')).toThrow(/--tenant/i);
    expect(() => parsePhase8SeedArgs(['--tenant', 'demo'], 'development')).toThrow(/--school/i);
    expect(() => parsePhase8SeedArgs(['--tenant', 'demo', '--school', 'DEMO'], 'development')).toThrow(/--session/i);
    expect(() => parsePhase8SeedArgs(['--tenant', 'demo', '--school', 'DEMO', '--session', '2026'], 'production')).toThrow(/production/i);
    expect(parsePhase8SeedArgs(['--', '--tenant', 'demo', '--school', 'DEMO', '--session', '2026'], 'development'))
      .toEqual({ tenant: 'demo', school: 'DEMO', session: '2026', seed: 26092026 });
  });

  it('validates a non-negative integer seed', () => {
    expect(parsePhase8SeedArgs(['--tenant', 'demo', '--school', 'DEMO', '--session', '2026', '--seed', '41'], 'test').seed).toBe(41);
    expect(() => parsePhase8SeedArgs(['--tenant', 'demo', '--school', 'DEMO', '--session', '2026', '--seed=-1'], 'test')).toThrow(/non-negative/i);
    expect(() => parsePhase8SeedArgs(['--tenant', 'demo', '--school', 'DEMO', '--session', '2026', '--seed', '1.5'], 'test')).toThrow(/non-negative/i);
  });

  it('builds deterministic reserved subjects and conflict-free weekly slots', () => {
    const options = { sections, subjects, assignments };
    const fixtures = buildPhase8DemoFixtures(26092026, options);
    expect(buildPhase8DemoFixtures(26092026, options)).toEqual(fixtures);
    expect(fixtures.subjects.length).toBeGreaterThan(0);
    expect(fixtures.subjects.every((subject) => subject.code.startsWith('DEMO-TT-'))).toBe(true);
    expect(fixtures.slots).toHaveLength(sections.length * 2);
    expect(fixtures.slots.some((slot) => slot.teacherAssignmentId === 'assignment-a')).toBe(true);
    expect(fixtures.slots.some((slot) => slot.teacherAssignmentId === null)).toBe(true);
    expect(fixtures.slots.every((slot) => slot.weekday >= 1 && slot.weekday <= 7 && slot.startTime < slot.endTime)).toBe(true);
    expect(new Set(fixtures.slots.map((slot) => slot.demoKey)).size).toBe(fixtures.slots.length);
    for (let leftIndex = 0; leftIndex < fixtures.slots.length; leftIndex += 1) {
      const left = fixtures.slots[leftIndex]!;
      for (const right of fixtures.slots.slice(leftIndex + 1)) {
        if (left.weekday !== right.weekday) continue;
        const overlaps = left.startTime < right.endTime && right.startTime < left.endTime;
        if (left.sectionId === right.sectionId) expect(overlaps).toBe(false);
        if (left.teacherAssignmentId === 'assignment-a' && right.teacherAssignmentId === 'assignment-a') expect(overlaps).toBe(false);
        if (left.roomLabel?.toLowerCase() === right.roomLabel?.toLowerCase()) expect(overlaps).toBe(false);
      }
    }
    expect(JSON.stringify(fixtures)).not.toMatch(/password|invitation|credential|account/i);
  });

  it('keeps assignments matched to their section and subject', () => {
    const fixtures = buildPhase8DemoFixtures(12345, { sections, subjects, assignments });
    const assigned = fixtures.slots.find((slot) => slot.teacherAssignmentId === 'assignment-a');
    expect(assigned).toMatchObject({ sectionId: 'section-a', subjectId: 'subject-math' });
  });
});

const persistenceEnabled = Boolean(process.env.DATABASE_PROVISIONER_URL && process.env.DATABASE_URL);

describe.skipIf(!persistenceEnabled)('Phase 8 timetable demo seed persistence', () => {
  const slug = `seed-phase8-${randomUUID()}`;
  const email = `seed-phase8-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let db: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let sessionId: string;
  let actorAccountId: string;
  let actorMembershipId: string;
  let sectionIds: string[];
  let manualSlotId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    db = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const provisioned = await provisionTenant(db.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Seed School', schoolCode: 'SEED', timezone: 'UTC', currency: 'USD',
    });
    tenantId = provisioned.tenant.id;
    schoolId = provisioned.school.id;
    const actor = await createAccountWithMembership(db.db, { email, passwordHash: 'fixture-hash', tenantId });
    actorAccountId = actor.id;
    actorMembershipId = actor.membershipId;
    const scope = { tenantId, schoolId };
    const setup = await withTenantContext(db.db, tenantId, async (tx) => {
      const session = await createAcademicSession(tx, scope, {
        name: 'Demo Session 2026', code: 'DEMO-SESSION', startDate: '2026-04-01', endDate: '2027-03-31',
      });
      const klass = await createAcademicClass(tx, scope, session.id, { name: 'Demo Grade 8', code: 'DEMO-G8' });
      const first = await createAcademicSection(tx, scope, klass.id, { name: 'Demo Section A', code: 'DEMO-A' });
      const second = await createAcademicSection(tx, scope, klass.id, { name: 'Demo Section B', code: 'DEMO-B' });
      const manualSubject = await createAcademicSubject(tx, scope, session.id, { name: 'Manual Subject', code: 'MANUAL' });
      const parent = await lockOrCreateWeeklyTimetable(tx, scope, session.id, { accountId: actorAccountId, membershipId: actorMembershipId });
      const [firstFixture] = buildPhase8DemoFixtures(26092026, {
        sections: [{ id: first.id, label: 'Demo Grade 8 · Demo Section A' }], subjects: [], assignments: [],
      }).slots;
      const manual = await insertTimetableSlot(tx, scope, parent.id, {
        sessionId: session.id, sectionId: first.id, subjectId: manualSubject.id, teacherAssignmentId: null,
        weekday: firstFixture!.weekday, startTime: '08:45', endTime: '09:15', roomLabel: 'Manual Room',
      }, { accountId: actorAccountId, membershipId: actorMembershipId });
      return { sessionId: session.id, sectionIds: [first.id, second.id], manualSlotId: manual.id };
    });
    sessionId = setup.sessionId;
    sectionIds = setup.sectionIds;
    manualSlotId = setup.manualSlotId;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from weekly_timetable_events where tenant_id = ${tenantId}`;
      await admin`delete from weekly_timetable_slots where tenant_id = ${tenantId}`;
      await admin`delete from weekly_timetables where tenant_id = ${tenantId}`;
      await admin`delete from tenants where id = ${tenantId}`;
      await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    await db?.close();
  });

  it('is idempotent, preserves manual conflicts, and does not write identity records', async () => {
    const target = { tenant: slug, school: 'SEED', session: 'DEMO-SESSION', seed: 26092026 };
    const [before] = await admin<{ accounts: number; credentials: number; memberships: number; invitations: number; staff: number }[]>`
      select (select count(*)::int from accounts) as accounts,
             (select count(*)::int from account_credentials) as credentials,
             (select count(*)::int from memberships where tenant_id = ${tenantId}) as memberships,
             (select count(*)::int from invitations where tenant_id = ${tenantId}) as invitations,
             (select count(*)::int from staff_profiles where tenant_id = ${tenantId}) as staff`;
    const first = await seedPhase8Demo(db.db, target);
    const second = await seedPhase8Demo(db.db, target);
    expect(first).toMatchObject({ tenantId, schoolId, sessionId, createdSubjects: 5, createdSlots: 3, skippedConflicts: 1 });
    expect(second).toMatchObject({ createdSubjects: 0, createdSlots: 0, existingDemoSlots: 3, skippedConflicts: 1 });
    const [after] = await admin<{ accounts: number; credentials: number; memberships: number; invitations: number; staff: number }[]>`
      select (select count(*)::int from accounts) as accounts,
             (select count(*)::int from account_credentials) as credentials,
             (select count(*)::int from memberships where tenant_id = ${tenantId}) as memberships,
             (select count(*)::int from invitations where tenant_id = ${tenantId}) as invitations,
             (select count(*)::int from staff_profiles where tenant_id = ${tenantId}) as staff`;
    expect(after).toEqual(before);
    const manual = await db.db.select().from(weeklyTimetableSlots).where(and(
      eq(weeklyTimetableSlots.tenantId, tenantId), eq(weeklyTimetableSlots.schoolId, schoolId), eq(weeklyTimetableSlots.id, manualSlotId),
    ));
    expect(manual).toHaveLength(1);
    expect(manual[0]).toMatchObject({ sectionId: sectionIds[0], startTime: '08:45:00', endTime: '09:15:00', demoKey: null });
  });
});
