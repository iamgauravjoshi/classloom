import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { faker } from '@faker-js/faker';
import { and, eq } from 'drizzle-orm';
import { createAcademicSubject, readAcademicSetup } from './academics.js';
import { createDb, type AppDb, type TenantTransaction } from './client.js';
import { isAssignableTeacher } from './staff.js';
import {
  academicSessions,
  academicSubjects,
  academicTeacherAssignments,
  accounts,
  memberships,
  schools,
  tenants,
  weeklyTimetableSlots,
} from './schema.js';
import { insertTimetableSlot, lockOrCreateWeeklyTimetable, readWeeklyTimetable, type TimetableSlotInput } from './timetable.js';
import { withTenantContext } from './tenant-context.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reservedSubjectPrefix = 'DEMO-TT-SUBJ-';

export type Phase8SeedTarget = { tenant: string; school: string; session: string; seed: number };

export function parsePhase8SeedArgs(args: string[], nodeEnv: string | undefined): Phase8SeedTarget {
  if (nodeEnv === 'production') throw new Error('The Phase 8 timetable seeder refuses production mode');
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: { tenant: { type: 'string' }, school: { type: 'string' }, session: { type: 'string' }, seed: { type: 'string' } },
    strict: true,
    allowPositionals: false,
  });
  const tenant = values.tenant?.trim();
  const school = values.school?.trim();
  const session = values.session?.trim();
  if (!tenant) throw new Error('--tenant is required');
  if (!school) throw new Error('--school is required');
  if (!session) throw new Error('--session is required');
  const seed = values.seed === undefined ? 26092026 : Number(values.seed);
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('--seed must be a non-negative integer');
  return { tenant, school, session, seed };
}

export type Phase8DemoOptions = {
  sections: { id: string; label: string }[];
  subjects: { id: string; name: string; code: string }[];
  assignments: { id: string; sectionId: string; subjectId: string; membershipId: string }[];
};

export function buildPhase8DemoFixtures(seed: number, options: Phase8DemoOptions) {
  faker.seed(seed);
  const subjectNames = [
    'Environmental Science', 'Creative Writing', 'Digital Literacy', 'World Geography', 'Life Skills',
  ];
  const subjects = subjectNames.map((name, index) => ({
    name,
    code: `${reservedSubjectPrefix}${String(index + 1).padStart(2, '0')}`,
  }));
  const slots = options.sections.flatMap((section, index) => {
    const eligibleAssignment = options.assignments.find((assignment) => assignment.sectionId === section.id &&
      options.subjects.some((subject) => subject.id === assignment.subjectId));
    const firstWeekday = (index % 7) + 1;
    const block = Math.floor(index / 7);
    const firstStart = timeAt(9 * 60 + block * 45);
    const secondWeekday = ((index + 3) % 7) + 1;
    const secondStart = timeAt(14 * 60 + block * 45);
    const assignedSubject = eligibleAssignment
      ? options.subjects.find((subject) => subject.id === eligibleAssignment.subjectId)
      : undefined;
    const firstSubject = assignedSubject ?? subjects[index % subjects.length]!;
    const secondSubject = subjects[(index + 1) % subjects.length]!;
    const room = faker.helpers.arrayElement(['Cedar', 'Maple', 'River', 'Garden', 'Discovery']);
    const codeIndex = String(index + 1).padStart(2, '0');
    return [
      {
        demoKey: `DEMO-TT-SLOT-${codeIndex}-01`,
        sectionId: section.id,
        subjectId: assignedSubject?.id ?? null,
        subjectCode: firstSubject.code,
        teacherAssignmentId: eligibleAssignment?.id ?? null,
        weekday: firstWeekday,
        startTime: firstStart,
        endTime: timeAt(9 * 60 + block * 45 + 40),
        roomLabel: `${room} ${index + 1}`,
      },
      {
        demoKey: `DEMO-TT-SLOT-${codeIndex}-02`,
        sectionId: section.id,
        subjectId: null,
        subjectCode: secondSubject.code,
        teacherAssignmentId: null,
        weekday: secondWeekday,
        startTime: secondStart,
        endTime: timeAt(14 * 60 + block * 45 + 40),
        roomLabel: `${room} ${index + 1}B`,
      },
    ];
  });
  return { subjects, slots };
}

function timeAt(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function resolveTarget(db: AppDb, target: Phase8SeedTarget) {
  const [tenant] = await db.select().from(tenants).where(uuidPattern.test(target.tenant)
    ? eq(tenants.id, target.tenant) : eq(tenants.slug, target.tenant)).limit(1);
  if (!tenant) throw new Error('Target tenant was not found');
  const [school] = await db.select().from(schools).where(and(
    eq(schools.tenantId, tenant.id),
    uuidPattern.test(target.school) ? eq(schools.id, target.school) : eq(schools.code, target.school.toUpperCase()),
  )).limit(1);
  if (!school) throw new Error('Target school was not found in that tenant');
  const [session] = await db.select().from(academicSessions).where(and(
    eq(academicSessions.tenantId, tenant.id), eq(academicSessions.schoolId, school.id),
    uuidPattern.test(target.session) ? eq(academicSessions.id, target.session) : eq(academicSessions.code, target.session.toUpperCase()),
  )).limit(1);
  if (!session) throw new Error('Target academic session was not found in that school');
  if (session.status === 'archived') throw new Error('Target academic session is archived');
  const [actor] = await db.select({ accountId: accounts.id, membershipId: memberships.id })
    .from(memberships).innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.status, 'active'), eq(accounts.status, 'active')))
    .limit(1);
  if (!actor) throw new Error('Target tenant needs an active account membership for audit attribution');
  return { tenantId: tenant.id, schoolId: school.id, sessionId: session.id, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId };
}

async function ensureReservedSubjects(tx: TenantTransaction, scope: { tenantId: string; schoolId: string }, sessionId: string,
  fixtures: ReturnType<typeof buildPhase8DemoFixtures>) {
  const existing = await tx.select().from(academicSubjects).where(and(
    eq(academicSubjects.tenantId, scope.tenantId), eq(academicSubjects.schoolId, scope.schoolId), eq(academicSubjects.sessionId, sessionId),
  ));
  const byCode = new Map(existing.map((subject) => [subject.code.toUpperCase(), subject]));
  const subjectIds = new Map<string, string>();
  for (const fixture of fixtures.subjects) {
    const current = byCode.get(fixture.code);
    if (current) {
      if (current.name !== fixture.name) throw new Error(`Reserved demo subject ${fixture.code} already belongs to a different subject`);
      subjectIds.set(fixture.code, current.id);
      continue;
    }
    const created = await createAcademicSubject(tx, scope, sessionId, fixture);
    subjectIds.set(fixture.code, created.id);
  }
  for (const subject of existing) subjectIds.set(subject.code.toUpperCase(), subject.id);
  return subjectIds;
}

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  return a.startTime.slice(0, 5) < b.endTime.slice(0, 5) && b.startTime.slice(0, 5) < a.endTime.slice(0, 5);
}

function hasConflict(candidate: {
  sectionId: string; teacherMembershipId: string | null; weekday: number;
  startTime: string; endTime: string; roomLabel: string | null;
}, existing: Awaited<ReturnType<typeof readWeeklyTimetable>>['slots']) {
  return existing.some((slot) => slot.weekday === candidate.weekday && overlaps(candidate, slot) && (
    slot.sectionId === candidate.sectionId ||
    Boolean(candidate.teacherMembershipId && slot.teacherMembershipId && candidate.teacherMembershipId === slot.teacherMembershipId) ||
    Boolean(candidate.roomLabel?.trim() && slot.roomLabel?.trim() && candidate.roomLabel.trim().toLocaleLowerCase() === slot.roomLabel.trim().toLocaleLowerCase())
  ));
}

export async function seedPhase8Demo(db: AppDb, target: Phase8SeedTarget) {
  if (process.env.NODE_ENV === 'production') throw new Error('The Phase 8 timetable seeder refuses production mode');
  const resolved = await resolveTarget(db, target);
  return withTenantContext(db, resolved.tenantId, async (tx) => {
    const scope = { tenantId: resolved.tenantId, schoolId: resolved.schoolId };
    const academic = await readAcademicSetup(tx, scope);
    const session = academic.sessions.find((item) => item.id === resolved.sessionId);
    if (!session || session.status === 'archived') throw new Error('Target academic session is unavailable');
    const classById = new Map(academic.classes.filter((item) => item.sessionId === session.id).map((item) => [item.id, item]));
    const sections = academic.sections.filter((section) => {
      const klass = classById.get(section.classId);
      return section.sessionId === session.id && klass?.code.toUpperCase().startsWith('DEMO-') && section.code.toUpperCase().startsWith('DEMO-');
    }).map((section) => ({ id: section.id, label: `${classById.get(section.classId)!.name} · ${section.name}` }));
    if (!sections.length) throw new Error('No demo classes and sections were found in this session; seed Phase 6 demo school data first');

    const eligibleMemberships = new Set<string>();
    for (const membershipId of new Set(academic.assignments.filter((item) => item.sessionId === session.id).map((item) => item.membershipId))) {
      if (await isAssignableTeacher(tx, scope, membershipId)) eligibleMemberships.add(membershipId);
    }
    const assignments = academic.assignments.filter((item) => item.sessionId === session.id && eligibleMemberships.has(item.membershipId))
      .map((item) => ({ id: item.id, sectionId: item.sectionId, subjectId: item.subjectId, membershipId: item.membershipId }));
    const subjects = academic.subjects.filter((item) => item.sessionId === session.id)
      .map((item) => ({ id: item.id, name: item.name, code: item.code }));
    const fixtures = buildPhase8DemoFixtures(target.seed, { sections, subjects, assignments });
    const subjectIds = await ensureReservedSubjects(tx, scope, session.id, fixtures);
    const actor = { accountId: resolved.actorAccountId, membershipId: resolved.actorMembershipId };
    const timetable = await lockOrCreateWeeklyTimetable(tx, scope, session.id, actor);
    const initial = await readWeeklyTimetable(tx, scope, session.id);
    const existingSlots = new Map((await tx.select().from(weeklyTimetableSlots).where(and(
      eq(weeklyTimetableSlots.tenantId, scope.tenantId), eq(weeklyTimetableSlots.schoolId, scope.schoolId),
      eq(weeklyTimetableSlots.sessionId, session.id),
    ))).filter((slot) => slot.demoKey).map((slot) => [slot.demoKey!, slot]));
    const assignmentById = new Map(academic.assignments.map((assignment) => [assignment.id, assignment]));
    const scheduleSlots = [...initial.slots];
    let createdSlots = 0;
    let existingDemoSlots = 0;
    let skippedConflicts = 0;
    for (const fixture of fixtures.slots) {
      if (existingSlots.has(fixture.demoKey)) { existingDemoSlots += 1; continue; }
      const subjectId = fixture.subjectId ?? subjectIds.get(fixture.subjectCode);
      if (!subjectId) throw new Error(`Demo timetable subject ${fixture.subjectCode} was not resolved`);
      const input: TimetableSlotInput = {
        sessionId: session.id, sectionId: fixture.sectionId, subjectId,
        teacherAssignmentId: fixture.teacherAssignmentId, weekday: fixture.weekday,
        startTime: fixture.startTime, endTime: fixture.endTime, roomLabel: fixture.roomLabel,
      };
      const teacherMembershipId = fixture.teacherAssignmentId ? assignmentById.get(fixture.teacherAssignmentId)?.membershipId ?? null : null;
      const candidate = { ...input, roomLabel: input.roomLabel ?? null, teacherMembershipId };
      if (hasConflict(candidate, scheduleSlots)) { skippedConflicts += 1; continue; }
      const slot = await insertTimetableSlot(tx, scope, timetable.id, input, actor, { demoKey: fixture.demoKey });
      scheduleSlots.push({ ...slot, teacherMembershipId });
      createdSlots += 1;
    }
    return { ...scope, sessionId: session.id, seed: target.seed, createdSubjects: fixtures.subjects.filter((subject) => !subjects.some((existing) => existing.code === subject.code)).length, createdSlots, existingDemoSlots, skippedConflicts };
  });
}

async function run() {
  try {
    const target = parsePhase8SeedArgs(process.argv.slice(2), process.env.NODE_ENV);
    const databaseUrl = process.env.DATABASE_PROVISIONER_URL;
    if (!databaseUrl) throw new Error('DATABASE_PROVISIONER_URL is required');
    const { db, close } = createDb(databaseUrl);
    try {
      const result = await seedPhase8Demo(db, target);
      console.log(`Phase 8 timetable seed complete: ${result.createdSubjects} reserved subjects created; ${result.createdSlots} slots created, ${result.existingDemoSlots} existing, ${result.skippedConflicts} skipped due to conflicts`);
    } finally { await close(); }
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 8 timetable seed failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await run();
