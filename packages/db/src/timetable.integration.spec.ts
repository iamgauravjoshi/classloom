import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject } from './academics.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { insertTimetableSlot, lockOrCreateWeeklyTimetable, publishWeeklyTimetable, readWeeklyTimetable, TimetableError, updateTimetableSlot } from './timetable.js';
import { weeklyTimetableEvents, weeklyTimetableSlots, weeklyTimetables } from './schema.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('timetable persistence and tenant isolation', () => {
  const slug = `timetable-${randomUUID()}`;
  const foreignSlug = `timetable-foreign-${randomUUID()}`;
  const actorEmail = `timetable-${randomUUID()}@example.test`;
  const secondarySchoolId = randomUUID();
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let foreignTenantId: string;
  let foreignSchoolId: string;
  let foreignSectionId: string;
  let actor: { accountId: string; membershipId: string };
  let sessionId: string;
  let sectionId: string;
  let otherSectionId: string;
  let subjectId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!, { maxConnections: 8 });
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const one = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Timetable School', schoolCode: 'TT1', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const two = await provisionTenant(provisioner.db, {
      tenantName: foreignSlug, tenantSlug: foreignSlug, schoolName: 'Foreign Timetable School', schoolCode: 'TT2', timezone: 'UTC', currency: 'USD',
    });
    tenantId = one.tenant.id;
    schoolId = one.school.id;
    foreignTenantId = two.tenant.id;
    foreignSchoolId = two.school.id;
    const membership = await createAccountWithMembership(runtime.db, { email: actorEmail, passwordHash: 'fixture-hash', tenantId });
    actor = { accountId: membership.id, membershipId: membership.membershipId };
    await admin`insert into schools (id, tenant_id, name, code, timezone, currency) values (${secondarySchoolId}, ${tenantId}, 'Other School', 'TT3', 'UTC', 'USD')`;
    const scope = { tenantId, schoolId };
    const session = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSession(tx, scope, {
      name: 'Timetable Session', code: 'TT-26', startDate: '2026-04-01', endDate: '2027-03-31',
    }));
    sessionId = session.id;
    const academicClass = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, scope, sessionId, { name: 'Grade 1', code: 'G1' }));
    const section = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSection(tx, scope, academicClass.id, { name: 'Section A', code: 'A' }));
    sectionId = section.id;
    const subject = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSubject(tx, scope, sessionId, { name: 'Math', code: 'MATH' }));
    subjectId = subject.id;
    const otherScope = { tenantId, schoolId: secondarySchoolId };
    const otherSession = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSession(tx, otherScope, {
      name: 'Other Session', code: 'OTHER', startDate: '2026-04-01', endDate: '2027-03-31',
    }));
    const otherClass = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicClass(tx, otherScope, otherSession.id, { name: 'Grade 1', code: 'G1' }));
    const otherSection = await withTenantContext(runtime.db, tenantId, (tx) => createAcademicSection(tx, otherScope, otherClass.id, { name: 'Section A', code: 'A' }));
    otherSectionId = otherSection.id;
    const foreignScope = { tenantId: foreignTenantId, schoolId: foreignSchoolId };
    const foreignSession = await withTenantContext(runtime.db, foreignTenantId, (tx) => createAcademicSession(tx, foreignScope, {
      name: 'Foreign Session', code: 'FOREIGN', startDate: '2026-04-01', endDate: '2027-03-31',
    }));
    const foreignClass = await withTenantContext(runtime.db, foreignTenantId, (tx) => createAcademicClass(tx, foreignScope, foreignSession.id, { name: 'Grade 1', code: 'G1' }));
    const foreignSection = await withTenantContext(runtime.db, foreignTenantId, (tx) => createAcademicSection(tx, foreignScope, foreignClass.id, { name: 'Section A', code: 'A' }));
    foreignSectionId = foreignSection.id;
  });

  afterAll(async () => {
    if (admin) {
      if (tenantId) {
        await admin`delete from weekly_timetable_events where tenant_id = ${tenantId}`;
        await admin`delete from weekly_timetable_slots where tenant_id = ${tenantId}`;
        await admin`delete from weekly_timetables where tenant_id = ${tenantId}`;
        await admin`delete from tenants where id = ${tenantId}`;
      }
      if (foreignTenantId) await admin`delete from tenants where id = ${foreignTenantId}`;
      if (actorEmail) await admin`delete from accounts where normalized_email = ${actorEmail}`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  const scope = () => ({ tenantId, schoolId });
  const slotInput = (patch: Record<string, unknown> = {}) => ({
    sessionId, sectionId, subjectId, weekday: 1, startTime: '09:00', endTime: '09:40', teacherAssignmentId: null, roomLabel: null, ...patch,
  });

  it('hides timetable rows without tenant context and rejects a cross-tenant write', async () => {
    const parent = await withTenantContext(runtime.db, tenantId, (tx) => lockOrCreateWeeklyTimetable(tx, scope(), sessionId, actor));
    expect(await runtime.db.select().from(weeklyTimetables).where(eq(weeklyTimetables.id, parent.id))).toEqual([]);
    await expect(runtime.db.insert(weeklyTimetables).values({ ...scope(), sessionId, createdByAccountId: actor.accountId, createdByMembershipId: actor.membershipId, updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId })).rejects.toThrow();
    await expect(withTenantContext(runtime.db, foreignTenantId, (tx) => readWeeklyTimetable(tx, { tenantId: foreignTenantId, schoolId }, sessionId)))
      .resolves.toMatchObject({ timetable: null, slots: [] });
  });

  it('rejects a timetable slot referencing another school’s academic section', async () => {
    const parent = await withTenantContext(runtime.db, tenantId, (tx) => lockOrCreateWeeklyTimetable(tx, scope(), sessionId, actor));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(weeklyTimetableSlots).values({
      ...scope(), timetableId: parent.id, sessionId, sectionId: otherSectionId, subjectId,
      weekday: 1, startTime: '09:00', endTime: '09:40', createdByAccountId: actor.accountId,
      createdByMembershipId: actor.membershipId, updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId,
    }))).rejects.toThrow();
  });

  it('rejects a timetable slot referencing another tenant’s academic section', async () => {
    const parent = await withTenantContext(runtime.db, tenantId, (tx) => lockOrCreateWeeklyTimetable(tx, scope(), sessionId, actor));
    await expect(withTenantContext(runtime.db, tenantId, (tx) => tx.insert(weeklyTimetableSlots).values({
      ...scope(), timetableId: parent.id, sessionId, sectionId: foreignSectionId, subjectId,
      weekday: 1, startTime: '09:00', endTime: '09:40', createdByAccountId: actor.accountId,
      createdByMembershipId: actor.membershipId, updatedByAccountId: actor.accountId, updatedByMembershipId: actor.membershipId,
    }))).rejects.toThrow();
  });

  it('publishes a schedule and returns it to draft after an edit while retaining event history', async () => {
    const parent = await withTenantContext(runtime.db, tenantId, (tx) => lockOrCreateWeeklyTimetable(tx, scope(), sessionId, actor));
    const slot = await withTenantContext(runtime.db, tenantId, (tx) => insertTimetableSlot(tx, scope(), parent.id, slotInput(), actor));
    const published = await withTenantContext(runtime.db, tenantId, (tx) => publishWeeklyTimetable(tx, scope(), parent.id, actor));
    expect(published.status).toBe('published');
    await withTenantContext(runtime.db, tenantId, (tx) => updateTimetableSlot(tx, scope(), slot.id, { ...slotInput(), startTime: '10:00', endTime: '10:40' }, actor));
    const schedule = await withTenantContext(runtime.db, tenantId, (tx) => readWeeklyTimetable(tx, scope(), sessionId));
    expect(schedule.timetable?.status).toBe('draft');
    expect(schedule.timetable?.publishedAt).toBeNull();
    const history = await withTenantContext(runtime.db, tenantId, (tx) => tx.select({ eventType: weeklyTimetableEvents.eventType })
      .from(weeklyTimetableEvents).where(eq(weeklyTimetableEvents.timetableId, parent.id))
      .orderBy(asc(weeklyTimetableEvents.createdAt), asc(weeklyTimetableEvents.id)));
    expect(history.map(({ eventType }) => eventType)).toEqual(['created', 'slot_created', 'published', 'slot_updated']);
  });

  it('rolls back schedule publication and its event together', async () => {
    const parent = await withTenantContext(runtime.db, tenantId, (tx) => lockOrCreateWeeklyTimetable(tx, scope(), sessionId, actor));
    const beforePublishedEvents = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(weeklyTimetableEvents)
      .where(and(eq(weeklyTimetableEvents.eventType, 'published'), eq(weeklyTimetableEvents.timetableId, parent.id))));
    await expect(withTenantContext(runtime.db, tenantId, async (tx) => {
      await publishWeeklyTimetable(tx, scope(), parent.id, actor);
      throw new Error('rollback schedule publish');
    })).rejects.toThrow('rollback schedule publish');
    const fresh = await withTenantContext(runtime.db, tenantId, (tx) => readWeeklyTimetable(tx, scope(), sessionId));
    expect(fresh.timetable?.status).toBe('draft');
    const publishedEvents = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(weeklyTimetableEvents)
      .where(and(eq(weeklyTimetableEvents.eventType, 'published'), eq(weeklyTimetableEvents.timetableId, parent.id))));
    expect(publishedEvents).toHaveLength(beforePublishedEvents.length);
  });

  it('serializes conflicting writes on the parent timetable lock', async () => {
    const tryInsert = (delay: number) => withTenantContext(runtime.db, tenantId, async (tx) => {
      const parent = await lockOrCreateWeeklyTimetable(tx, scope(), sessionId, actor);
      const current = await readWeeklyTimetable(tx, scope(), sessionId);
      if (current.slots.some((slot) => slot.weekday === 1 && slot.sectionId === sectionId && slot.startTime < '09:40' && slot.endTime > '09:00')) {
        throw new TimetableError('CONFLICT', 'The time overlaps an existing slot for this section');
      }
      await insertTimetableSlot(tx, scope(), parent.id, slotInput(), actor);
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    });
    const outcomes = await Promise.allSettled([tryInsert(80), tryInsert(0)]);
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
