import { and, eq, or, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { accounts, academicClasses, academicSections, academicSessions, academicSubjects, academicTeacherAssignments, membershipRoleAssignments, memberships, schools } from './schema.js';

export type AcademicSessionInput = { name: string; code: string; startDate: string; endDate: string };

export class AcademicSetupError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) { super(message); }
}

export function validateAcademicCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) throw new AcademicSetupError('INVALID', 'Code must be 1–20 letters, numbers, hyphens or underscores');
  return code;
}

export function validateAcademicSession(input: AcademicSessionInput): AcademicSessionInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new AcademicSetupError('INVALID', 'Session name must be 2–120 characters');
  const code = validateAcademicCode(input.code);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const validDate = (value: string) => datePattern.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(input.startDate) || !validDate(input.endDate) ||
    input.endDate <= input.startDate) throw new AcademicSetupError('INVALID', 'Session end date must follow start date');
  return { name, code, startDate: input.startDate, endDate: input.endDate };
}

type Scope = { tenantId: string; schoolId: string };
type NamedInput = { name: string; code: string };

function normalizedName(value: string): string {
  const name = value.trim();
  if (name.length < 2 || name.length > 120) throw new AcademicSetupError('INVALID', 'Name must be 2–120 characters');
  return name;
}

function normalizedNamed(input: NamedInput): NamedInput {
  return { name: normalizedName(input.name), code: validateAcademicCode(input.code) };
}

export async function listAcademicSchools(tx: TenantTransaction, tenantId: string) {
  return tx.select({ id: schools.id, name: schools.name, code: schools.code })
    .from(schools).where(eq(schools.tenantId, tenantId)).orderBy(schools.name);
}

export async function listActiveAcademicMembers(tx: TenantTransaction, scope: Scope) {
  return tx.selectDistinct({ id: memberships.id, email: accounts.normalizedEmail, displayName: accounts.displayName })
    .from(memberships).innerJoin(accounts, eq(memberships.accountId, accounts.id))
    .innerJoin(membershipRoleAssignments, and(eq(membershipRoleAssignments.tenantId, memberships.tenantId), eq(membershipRoleAssignments.membershipId, memberships.id)))
    .where(and(eq(memberships.tenantId, scope.tenantId), eq(memberships.status, 'active'), eq(accounts.status, 'active'),
      or(eq(membershipRoleAssignments.scopeKind, 'tenant'), eq(membershipRoleAssignments.schoolId, scope.schoolId))))
    .orderBy(accounts.normalizedEmail);
}

async function requireSession(tx: TenantTransaction, scope: Scope, sessionId: string) {
  const [session] = await tx.select().from(academicSessions).where(and(
    eq(academicSessions.tenantId, scope.tenantId), eq(academicSessions.schoolId, scope.schoolId), eq(academicSessions.id, sessionId),
  )).limit(1);
  if (!session) throw new AcademicSetupError('NOT_FOUND', 'Academic session was not found');
  return session;
}

function requireEditable(status: string) {
  if (status === 'archived') throw new AcademicSetupError('CONFLICT', 'Archived sessions cannot be changed');
}

export async function readAcademicSetup(tx: TenantTransaction, scope: Scope) {
  const [school] = await tx.select({ id: schools.id, name: schools.name, code: schools.code })
    .from(schools).where(and(eq(schools.tenantId, scope.tenantId), eq(schools.id, scope.schoolId))).limit(1);
  if (!school) throw new AcademicSetupError('NOT_FOUND', 'School was not found');
  const predicate = (table: typeof academicSessions | typeof academicClasses | typeof academicSections | typeof academicSubjects | typeof academicTeacherAssignments) =>
    and(eq(table.tenantId, scope.tenantId), eq(table.schoolId, scope.schoolId));
  const [sessions, classes, sections, subjects, assignments] = await Promise.all([
    tx.select().from(academicSessions).where(predicate(academicSessions)).orderBy(academicSessions.startDate),
    tx.select().from(academicClasses).where(predicate(academicClasses)).orderBy(academicClasses.sortOrder, academicClasses.name),
    tx.select().from(academicSections).where(predicate(academicSections)).orderBy(academicSections.name),
    tx.select().from(academicSubjects).where(predicate(academicSubjects)).orderBy(academicSubjects.name),
    tx.select().from(academicTeacherAssignments).where(predicate(academicTeacherAssignments)),
  ]);
  return { school, sessions, classes, sections, subjects, assignments };
}

export async function createAcademicSession(tx: TenantTransaction, scope: Scope, input: AcademicSessionInput) {
  const values = validateAcademicSession(input);
  const [school] = await tx.select({ id: schools.id }).from(schools)
    .where(and(eq(schools.tenantId, scope.tenantId), eq(schools.id, scope.schoolId))).limit(1);
  if (!school) throw new AcademicSetupError('NOT_FOUND', 'School was not found');
  const [created] = await tx.insert(academicSessions).values({ ...scope, ...values }).returning();
  return created;
}

export async function createAcademicClass(tx: TenantTransaction, scope: Scope, sessionId: string, input: NamedInput & { sortOrder?: number }) {
  requireEditable((await requireSession(tx, scope, sessionId)).status);
  const [created] = await tx.insert(academicClasses).values({ ...scope, sessionId, ...normalizedNamed(input), sortOrder: input.sortOrder ?? 0 }).returning();
  return created;
}

export async function createAcademicSubject(tx: TenantTransaction, scope: Scope, sessionId: string, input: NamedInput) {
  requireEditable((await requireSession(tx, scope, sessionId)).status);
  const [created] = await tx.insert(academicSubjects).values({ ...scope, sessionId, ...normalizedNamed(input) }).returning();
  return created;
}

export async function createAcademicSection(tx: TenantTransaction, scope: Scope, classId: string, input: NamedInput & { capacity?: number }) {
  const [parent] = await tx.select().from(academicClasses).where(and(
    eq(academicClasses.tenantId, scope.tenantId), eq(academicClasses.schoolId, scope.schoolId), eq(academicClasses.id, classId),
  )).limit(1);
  if (!parent) throw new AcademicSetupError('NOT_FOUND', 'Class was not found');
  requireEditable((await requireSession(tx, scope, parent.sessionId)).status);
  if (input.capacity !== undefined && (!Number.isInteger(input.capacity) || input.capacity < 1)) throw new AcademicSetupError('INVALID', 'Capacity must be positive');
  const [created] = await tx.insert(academicSections).values({ ...scope, sessionId: parent.sessionId, classId, ...normalizedNamed(input), capacity: input.capacity }).returning();
  return created;
}

export async function createAcademicAssignment(tx: TenantTransaction, scope: Scope, sectionId: string, input: { subjectId: string; membershipId: string }) {
  const [section] = await tx.select().from(academicSections).where(and(
    eq(academicSections.tenantId, scope.tenantId), eq(academicSections.schoolId, scope.schoolId), eq(academicSections.id, sectionId),
  )).limit(1);
  if (!section) throw new AcademicSetupError('NOT_FOUND', 'Section was not found');
  requireEditable((await requireSession(tx, scope, section.sessionId)).status);
  const [subject] = await tx.select({ id: academicSubjects.id }).from(academicSubjects).where(and(
    eq(academicSubjects.tenantId, scope.tenantId), eq(academicSubjects.schoolId, scope.schoolId),
    eq(academicSubjects.sessionId, section.sessionId), eq(academicSubjects.id, input.subjectId),
  )).limit(1);
  const [member] = await tx.select({ id: memberships.id }).from(memberships)
    .innerJoin(accounts, eq(memberships.accountId, accounts.id)).where(and(
    eq(memberships.tenantId, scope.tenantId), eq(memberships.id, input.membershipId), eq(memberships.status, 'active'), eq(accounts.status, 'active'),
  )).limit(1);
  const [schoolGrant] = await tx.select({ id: membershipRoleAssignments.id }).from(membershipRoleAssignments).where(and(
    eq(membershipRoleAssignments.tenantId, scope.tenantId), eq(membershipRoleAssignments.membershipId, input.membershipId),
    or(eq(membershipRoleAssignments.scopeKind, 'tenant'), eq(membershipRoleAssignments.schoolId, scope.schoolId)),
  )).limit(1);
  if (!subject || !member || !schoolGrant) throw new AcademicSetupError('NOT_FOUND', 'Subject or active school account was not found');
  const [created] = await tx.insert(academicTeacherAssignments).values({
    ...scope, sessionId: section.sessionId, sectionId, subjectId: input.subjectId, membershipId: input.membershipId,
  }).returning();
  return created;
}

export async function activateAcademicSession(tx: TenantTransaction, scope: Scope, sessionId: string) {
  // Serialize activations for this school so the partial unique index cannot race.
  const [school] = await tx.select({ id: schools.id }).from(schools).where(and(
    eq(schools.tenantId, scope.tenantId), eq(schools.id, scope.schoolId),
  )).for('update').limit(1);
  if (!school) throw new AcademicSetupError('NOT_FOUND', 'School was not found');
  const session = await requireSession(tx, scope, sessionId);
  if (session.status === 'archived') throw new AcademicSetupError('CONFLICT', 'Archived sessions cannot be activated');
  if (session.status === 'active') return session;
  const [classCount, sectionCount, subjectCount] = await Promise.all([
    tx.select({ count: sql<number>`count(*)::int` }).from(academicClasses).where(and(eq(academicClasses.tenantId, scope.tenantId), eq(academicClasses.schoolId, scope.schoolId), eq(academicClasses.sessionId, sessionId))),
    tx.select({ count: sql<number>`count(*)::int` }).from(academicSections).where(and(eq(academicSections.tenantId, scope.tenantId), eq(academicSections.schoolId, scope.schoolId), eq(academicSections.sessionId, sessionId))),
    tx.select({ count: sql<number>`count(*)::int` }).from(academicSubjects).where(and(eq(academicSubjects.tenantId, scope.tenantId), eq(academicSubjects.schoolId, scope.schoolId), eq(academicSubjects.sessionId, sessionId))),
  ]);
  if (!classCount[0]?.count || !sectionCount[0]?.count || !subjectCount[0]?.count) {
    throw new AcademicSetupError('INVALID', 'Add a class, section, and subject before activating');
  }
  await tx.update(academicSessions).set({ status: 'archived' }).where(and(
    eq(academicSessions.tenantId, scope.tenantId), eq(academicSessions.schoolId, scope.schoolId), eq(academicSessions.status, 'active'),
  ));
  const [active] = await tx.update(academicSessions).set({ status: 'active' }).where(and(
    eq(academicSessions.tenantId, scope.tenantId), eq(academicSessions.schoolId, scope.schoolId), eq(academicSessions.id, sessionId),
  )).returning();
  return active;
}
