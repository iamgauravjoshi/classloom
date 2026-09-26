import { and, eq, gt, ilike, or, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import {
  accounts, academicTeacherAssignments, membershipRoleAssignments, memberships, schools,
  securityEvents, staffProfiles, staffSchoolAffiliations, teacherProfiles,
} from './schema.js';

export type StaffScope = { tenantId: string; schoolId: string };
export type StaffProfileInput = {
  staffCode: string;
  givenName: string;
  familyName: string;
  preferredName?: string | null;
  workEmail?: string | null;
  phone?: string | null;
};
export type StaffListFilters = {
  q?: string;
  status?: 'active' | 'inactive';
  kind?: 'staff' | 'teacher';
  cursor?: string;
  limit?: number;
};
export type StaffAffiliationInput = {
  designation: string;
  startDate?: string | null;
  kind: 'staff' | 'teacher';
  status?: 'active' | 'inactive';
};
export type StaffCreateInput = {
  profile: StaffProfileInput;
  affiliation: StaffAffiliationInput;
  teacher?: { qualification?: string | null; specialization?: string | null };
};
export type StaffAudit = { actorAccountId: string; requestId?: string };

export class StaffError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'StaffError';
  }
}

export function normalizeStaffCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) {
    throw new StaffError('INVALID', 'Staff code must be 1–20 letters, numbers, hyphens, or underscores');
  }
  return code;
}

function requiredName(value: string, label: string): string {
  const result = value.trim();
  if (result.length < 2 || result.length > 120) throw new StaffError('INVALID', `${label} must be 2–120 characters`);
  return result;
}

function optionalText(value: string | null | undefined, label: string, maximum: number): string | null {
  const result = value?.trim() || null;
  if (result && result.length > maximum) throw new StaffError('INVALID', `${label} must be at most ${maximum} characters`);
  return result;
}

export function normalizeStaffProfile(input: StaffProfileInput) {
  const workEmail = optionalText(input.workEmail, 'Work email', 254)?.toLowerCase() ?? null;
  if (workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail)) throw new StaffError('INVALID', 'Work email must be a valid email address');
  return {
    staffCode: normalizeStaffCode(input.staffCode),
    givenName: requiredName(input.givenName, 'Given name'),
    familyName: requiredName(input.familyName, 'Family name'),
    preferredName: optionalText(input.preferredName, 'Preferred name', 120),
    workEmail,
    phone: optionalText(input.phone, 'Phone', 30),
  };
}

export function normalizeStaffListFilters(filters: StaffListFilters): Required<Pick<StaffListFilters, 'limit'>> & StaffListFilters {
  if (filters.limit !== undefined && (!Number.isInteger(filters.limit) || filters.limit < 1)) {
    throw new StaffError('INVALID', 'Page size must be a positive integer');
  }
  const q = filters.q?.trim() || undefined;
  if (q && q.length > 120) throw new StaffError('INVALID', 'Search must be at most 120 characters');
  return { ...filters, q, limit: Math.min(filters.limit ?? 25, 100) };
}

function normalizedAffiliation(input: StaffAffiliationInput) {
  const designation = input.designation.trim();
  if (!designation || designation.length > 120) throw new StaffError('INVALID', 'Designation must be 1–120 characters');
  if (input.kind !== 'staff' && input.kind !== 'teacher') throw new StaffError('INVALID', 'Choose staff or teacher');
  if (input.status && input.status !== 'active' && input.status !== 'inactive') throw new StaffError('INVALID', 'Choose a valid affiliation status');
  if (input.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new StaffError('INVALID', 'Start date must be a calendar date');
  return { designation, kind: input.kind, status: input.status ?? 'active', startDate: input.startDate || null };
}

function normalizedTeacher(input: StaffCreateInput['teacher']) {
  return {
    qualification: optionalText(input?.qualification, 'Qualification', 240),
    specialization: optionalText(input?.specialization, 'Specialization', 240),
  };
}

function dbCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value.code ?? value.cause?.code;
}

const sortKey = sql<string>`lower(${staffProfiles.familyName}) || chr(31) || lower(${staffProfiles.givenName}) || chr(31) || ${staffProfiles.id}::text`;

function staffSelection() {
  return {
    id: staffProfiles.id,
    staffCode: staffProfiles.staffCode,
    givenName: staffProfiles.givenName,
    familyName: staffProfiles.familyName,
    preferredName: staffProfiles.preferredName,
    workEmail: staffProfiles.workEmail,
    phone: staffProfiles.phone,
    membershipId: staffProfiles.membershipId,
    affiliationId: staffSchoolAffiliations.id,
    schoolId: staffSchoolAffiliations.schoolId,
    designation: staffSchoolAffiliations.designation,
    startDate: staffSchoolAffiliations.startDate,
    kind: staffSchoolAffiliations.kind,
    status: staffSchoolAffiliations.status,
    qualification: teacherProfiles.qualification,
    specialization: teacherProfiles.specialization,
    sortKey,
  };
}

export async function createStaffProfile(tx: TenantTransaction, scope: StaffScope, input: StaffCreateInput, audit: StaffAudit) {
  const profile = normalizeStaffProfile(input.profile);
  const affiliation = normalizedAffiliation(input.affiliation);
  const teacher = normalizedTeacher(input.teacher);
  const [school] = await tx.select({ id: schools.id }).from(schools)
    .where(and(eq(schools.tenantId, scope.tenantId), eq(schools.id, scope.schoolId))).limit(1);
  if (!school) throw new StaffError('NOT_FOUND', 'School was not found');
  try {
    const [created] = await tx.insert(staffProfiles).values({ tenantId: scope.tenantId, ...profile }).returning();
    if (!created) throw new Error('Staff insert did not return a row');
    if (affiliation.kind === 'teacher' || input.teacher) {
      await tx.insert(teacherProfiles).values({ tenantId: scope.tenantId, staffId: created.id, ...teacher });
    }
    await tx.insert(staffSchoolAffiliations).values({ tenantId: scope.tenantId, schoolId: scope.schoolId, staffId: created.id, ...affiliation });
    await tx.insert(securityEvents).values({
      eventType: 'staff_created', accountId: audit.actorAccountId, tenantId: scope.tenantId, requestId: audit.requestId,
      metadata: { staffId: created.id, schoolId: scope.schoolId, kind: affiliation.kind },
    });
    return readSchoolStaff(tx, scope, created.id);
  } catch (error) {
    if (dbCode(error) === '23505') throw new StaffError('CONFLICT', 'A staff member with this code already exists');
    throw error;
  }
}

export async function readSchoolStaff(tx: TenantTransaction, scope: StaffScope, staffId: string) {
  const [record] = await tx.select(staffSelection()).from(staffSchoolAffiliations)
    .innerJoin(staffProfiles, and(eq(staffProfiles.tenantId, staffSchoolAffiliations.tenantId), eq(staffProfiles.id, staffSchoolAffiliations.staffId)))
    .leftJoin(teacherProfiles, and(eq(teacherProfiles.tenantId, staffProfiles.tenantId), eq(teacherProfiles.staffId, staffProfiles.id)))
    .where(and(eq(staffSchoolAffiliations.tenantId, scope.tenantId), eq(staffSchoolAffiliations.schoolId, scope.schoolId), eq(staffSchoolAffiliations.staffId, staffId)))
    .limit(1);
  if (!record) throw new StaffError('NOT_FOUND', 'Staff member was not found in this school');
  const { sortKey: _, ...result } = record;
  return result;
}

export type StaffRecord = Awaited<ReturnType<typeof readSchoolStaff>>;
export type StaffListPage = { items: StaffRecord[]; nextCursor: string | null };

export async function listStaffSchools(tx: TenantTransaction, tenantId: string) {
  return tx.select({ id: schools.id, name: schools.name, code: schools.code })
    .from(schools).where(eq(schools.tenantId, tenantId)).orderBy(schools.name);
}

export async function listSchoolStaff(tx: TenantTransaction, scope: StaffScope, input: StaffListFilters): Promise<StaffListPage> {
  const filters = normalizeStaffListFilters(input);
  let cursorKey: string | undefined;
  if (filters.cursor) {
    try { cursorKey = Buffer.from(filters.cursor, 'base64url').toString('utf8'); }
    catch { throw new StaffError('INVALID', 'Page cursor is invalid'); }
    if (!cursorKey || cursorKey.length > 400) throw new StaffError('INVALID', 'Page cursor is invalid');
  }
  const pattern = filters.q ? `%${filters.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const rows = await tx.select(staffSelection()).from(staffSchoolAffiliations)
    .innerJoin(staffProfiles, and(eq(staffProfiles.tenantId, staffSchoolAffiliations.tenantId), eq(staffProfiles.id, staffSchoolAffiliations.staffId)))
    .leftJoin(teacherProfiles, and(eq(teacherProfiles.tenantId, staffProfiles.tenantId), eq(teacherProfiles.staffId, staffProfiles.id)))
    .where(and(
      eq(staffSchoolAffiliations.tenantId, scope.tenantId), eq(staffSchoolAffiliations.schoolId, scope.schoolId),
      filters.status ? eq(staffSchoolAffiliations.status, filters.status) : undefined,
      filters.kind ? eq(staffSchoolAffiliations.kind, filters.kind) : undefined,
      cursorKey ? gt(sortKey, cursorKey) : undefined,
      pattern ? or(ilike(staffProfiles.givenName, pattern), ilike(staffProfiles.familyName, pattern), ilike(staffProfiles.staffCode, pattern)) : undefined,
    ))
    .orderBy(sortKey)
    .limit(filters.limit + 1);
  const page = rows.slice(0, filters.limit);
  return {
    items: page.map(({ sortKey: _, ...record }) => record),
    nextCursor: rows.length > filters.limit && page.length ? Buffer.from(page[page.length - 1]!.sortKey, 'utf8').toString('base64url') : null,
  };
}

async function auditStaff(tx: TenantTransaction, scope: StaffScope, staffId: string, eventType: string, audit: StaffAudit, metadata: Record<string, string> = {}) {
  await tx.insert(securityEvents).values({
    eventType, accountId: audit.actorAccountId, tenantId: scope.tenantId, requestId: audit.requestId,
    metadata: { staffId, schoolId: scope.schoolId, ...metadata },
  });
}

export async function listStaffAffiliationSchoolIds(tx: TenantTransaction, tenantId: string, staffId: string): Promise<string[]> {
  const rows = await tx.select({ schoolId: staffSchoolAffiliations.schoolId }).from(staffSchoolAffiliations).where(and(
    eq(staffSchoolAffiliations.tenantId, tenantId), eq(staffSchoolAffiliations.staffId, staffId),
  ));
  return rows.map((row) => row.schoolId);
}

async function hasTeacherRecord(tx: TenantTransaction, tenantId: string, staffId: string) {
  const [record] = await tx.select({ staffId: teacherProfiles.staffId }).from(teacherProfiles).where(and(
    eq(teacherProfiles.tenantId, tenantId), eq(teacherProfiles.staffId, staffId),
  )).limit(1);
  return Boolean(record);
}

async function lockStaffProfile(tx: TenantTransaction, tenantId: string, staffId: string) {
  const [record] = await tx.select({ id: staffProfiles.id }).from(staffProfiles)
    .where(and(eq(staffProfiles.tenantId, tenantId), eq(staffProfiles.id, staffId)))
    .for('update').limit(1);
  if (!record) throw new StaffError('NOT_FOUND', 'Staff member was not found');
}

async function activeMemberAtSchool(tx: TenantTransaction, scope: StaffScope, membershipId: string): Promise<boolean> {
  const [member] = await tx.select({ id: memberships.id }).from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .innerJoin(membershipRoleAssignments, and(
      eq(membershipRoleAssignments.tenantId, memberships.tenantId),
      eq(membershipRoleAssignments.membershipId, memberships.id),
    ))
    .where(and(
      eq(memberships.tenantId, scope.tenantId), eq(memberships.id, membershipId),
      eq(memberships.status, 'active'), eq(accounts.status, 'active'),
      or(eq(membershipRoleAssignments.scopeKind, 'tenant'), and(eq(membershipRoleAssignments.scopeKind, 'school'), eq(membershipRoleAssignments.schoolId, scope.schoolId))),
    )).limit(1);
  return Boolean(member);
}

async function requireMemberAtSchool(tx: TenantTransaction, scope: StaffScope, membershipId: string) {
  if (!await activeMemberAtSchool(tx, scope, membershipId)) {
    throw new StaffError('INVALID', 'The linked account must be active and have access to this school');
  }
}

async function requireActiveMembership(tx: TenantTransaction, tenantId: string, membershipId: string) {
  const [member] = await tx.select({ id: memberships.id }).from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId), eq(memberships.status, 'active'), eq(accounts.status, 'active')))
    .limit(1);
  if (!member) throw new StaffError('INVALID', 'The linked account and tenant membership must be active');
}

export async function updateStaffProfile(tx: TenantTransaction, scope: StaffScope, staffId: string, changes: Partial<Omit<StaffProfileInput, 'staffCode'>>, audit: StaffAudit) {
  const current = await readSchoolStaff(tx, scope, staffId);
  const normalized = normalizeStaffProfile({
    staffCode: current.staffCode,
    givenName: changes.givenName ?? current.givenName,
    familyName: changes.familyName ?? current.familyName,
    preferredName: changes.preferredName === undefined ? current.preferredName : changes.preferredName,
    workEmail: changes.workEmail === undefined ? current.workEmail : changes.workEmail,
    phone: changes.phone === undefined ? current.phone : changes.phone,
  });
  await tx.update(staffProfiles).set({ ...normalized, updatedAt: new Date() }).where(and(
    eq(staffProfiles.tenantId, scope.tenantId), eq(staffProfiles.id, staffId),
  ));
  await auditStaff(tx, scope, staffId, 'staff_profile_updated', audit, { changedFields: Object.keys(changes).sort().join(',') });
  return readSchoolStaff(tx, scope, staffId);
}

export async function updateStaffAffiliation(tx: TenantTransaction, scope: StaffScope, staffId: string, changes: Partial<StaffAffiliationInput>, audit: StaffAudit) {
  await lockStaffProfile(tx, scope.tenantId, staffId);
  const current = await readSchoolStaff(tx, scope, staffId);
  const values = normalizedAffiliation({
    designation: changes.designation ?? current.designation,
    kind: changes.kind ?? current.kind as 'staff' | 'teacher',
    status: changes.status ?? current.status as 'active' | 'inactive',
    startDate: changes.startDate === undefined ? current.startDate : changes.startDate,
  });
  if (values.kind === 'teacher' && !await hasTeacherRecord(tx, scope.tenantId, staffId)) {
    await tx.insert(teacherProfiles).values({ tenantId: scope.tenantId, staffId });
  }
  if (values.status === 'active' && current.membershipId) await requireMemberAtSchool(tx, scope, current.membershipId);
  await tx.update(staffSchoolAffiliations).set({ ...values, updatedAt: new Date() }).where(and(
    eq(staffSchoolAffiliations.tenantId, scope.tenantId), eq(staffSchoolAffiliations.schoolId, scope.schoolId), eq(staffSchoolAffiliations.staffId, staffId),
  ));
  await auditStaff(tx, scope, staffId, 'staff_affiliation_updated', audit, { beforeStatus: current.status, afterStatus: values.status, beforeKind: current.kind, afterKind: values.kind });
  return readSchoolStaff(tx, scope, staffId);
}

export async function addStaffAffiliation(tx: TenantTransaction, source: StaffScope, targetSchoolId: string, staffId: string, input: StaffAffiliationInput, audit: StaffAudit) {
  await lockStaffProfile(tx, source.tenantId, staffId);
  const current = await readSchoolStaff(tx, source, staffId);
  const values = normalizedAffiliation(input);
  const [targetSchool] = await tx.select({ id: schools.id }).from(schools).where(and(
    eq(schools.tenantId, source.tenantId), eq(schools.id, targetSchoolId),
  )).limit(1);
  if (!targetSchool) throw new StaffError('NOT_FOUND', 'Destination school was not found');
  if (values.kind === 'teacher' && !await hasTeacherRecord(tx, source.tenantId, staffId)) {
    await tx.insert(teacherProfiles).values({ tenantId: source.tenantId, staffId });
  }
  if (values.status === 'active' && current.membershipId) await requireMemberAtSchool(tx, { ...source, schoolId: targetSchoolId }, current.membershipId);
  try {
    await tx.insert(staffSchoolAffiliations).values({ tenantId: source.tenantId, schoolId: targetSchoolId, staffId, ...values });
  } catch (error) {
    if (dbCode(error) === '23505') throw new StaffError('CONFLICT', 'This staff member already belongs to that school');
    throw error;
  }
  await auditStaff(tx, source, staffId, 'staff_affiliation_added', audit, { targetSchoolId });
  return readSchoolStaff(tx, { ...source, schoolId: targetSchoolId }, staffId);
}

export async function upsertTeacherProfile(tx: TenantTransaction, scope: StaffScope, staffId: string, input: StaffCreateInput['teacher'], audit: StaffAudit) {
  await readSchoolStaff(tx, scope, staffId);
  const [current] = await tx.select().from(teacherProfiles).where(and(
    eq(teacherProfiles.tenantId, scope.tenantId), eq(teacherProfiles.staffId, staffId),
  )).limit(1);
  const values = normalizedTeacher({
    qualification: input?.qualification === undefined ? current?.qualification : input.qualification,
    specialization: input?.specialization === undefined ? current?.specialization : input.specialization,
  });
  await tx.insert(teacherProfiles).values({ tenantId: scope.tenantId, staffId, ...values })
    .onConflictDoUpdate({ target: teacherProfiles.staffId, set: { ...values, updatedAt: new Date() } });
  await auditStaff(tx, scope, staffId, 'teacher_profile_updated', audit);
  return readSchoolStaff(tx, scope, staffId);
}

export async function linkStaffMembership(tx: TenantTransaction, scope: StaffScope, staffId: string, membershipId: string, audit: StaffAudit) {
  await lockStaffProfile(tx, scope.tenantId, staffId);
  const current = await readSchoolStaff(tx, scope, staffId);
  if (current.membershipId === membershipId) return current;
  if (current.membershipId) {
    const [assignment] = await tx.select({ id: academicTeacherAssignments.id }).from(academicTeacherAssignments).where(and(
      eq(academicTeacherAssignments.tenantId, scope.tenantId), eq(academicTeacherAssignments.membershipId, current.membershipId),
    )).limit(1);
    if (assignment) throw new StaffError('CONFLICT', 'This account has teaching assignments and cannot be replaced');
  }
  const affiliations = await tx.select({ schoolId: staffSchoolAffiliations.schoolId }).from(staffSchoolAffiliations).where(and(
    eq(staffSchoolAffiliations.tenantId, scope.tenantId), eq(staffSchoolAffiliations.staffId, staffId), eq(staffSchoolAffiliations.status, 'active'),
  ));
  await requireActiveMembership(tx, scope.tenantId, membershipId);
  for (const affiliation of affiliations) await requireMemberAtSchool(tx, { tenantId: scope.tenantId, schoolId: affiliation.schoolId }, membershipId);
  try {
    await tx.update(staffProfiles).set({ membershipId, updatedAt: new Date() }).where(and(
      eq(staffProfiles.tenantId, scope.tenantId), eq(staffProfiles.id, staffId),
    ));
  } catch (error) {
    if (dbCode(error) === '23505') throw new StaffError('CONFLICT', 'This account is already linked to another staff member');
    throw error;
  }
  await auditStaff(tx, scope, staffId, 'staff_account_linked', audit, { membershipId });
  return readSchoolStaff(tx, scope, staffId);
}

export async function unlinkStaffMembership(tx: TenantTransaction, scope: StaffScope, staffId: string, audit: StaffAudit) {
  await lockStaffProfile(tx, scope.tenantId, staffId);
  const current = await readSchoolStaff(tx, scope, staffId);
  if (!current.membershipId) return current;
  const [assignment] = await tx.select({ id: academicTeacherAssignments.id }).from(academicTeacherAssignments).where(and(
    eq(academicTeacherAssignments.tenantId, scope.tenantId), eq(academicTeacherAssignments.membershipId, current.membershipId),
  )).limit(1);
  if (assignment) throw new StaffError('CONFLICT', 'This account has teaching assignments and cannot be unlinked');
  await tx.update(staffProfiles).set({ membershipId: null, updatedAt: new Date() }).where(and(
    eq(staffProfiles.tenantId, scope.tenantId), eq(staffProfiles.id, staffId),
  ));
  await auditStaff(tx, scope, staffId, 'staff_account_unlinked', audit, { membershipId: current.membershipId });
  return readSchoolStaff(tx, scope, staffId);
}

export async function listEligibleStaffAccounts(tx: TenantTransaction, scope: StaffScope) {
  return tx.selectDistinct({ id: memberships.id, email: accounts.normalizedEmail, displayName: accounts.displayName })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .innerJoin(membershipRoleAssignments, and(
      eq(membershipRoleAssignments.tenantId, memberships.tenantId), eq(membershipRoleAssignments.membershipId, memberships.id),
    ))
    .leftJoin(staffProfiles, and(eq(staffProfiles.tenantId, memberships.tenantId), eq(staffProfiles.membershipId, memberships.id)))
    .where(and(
      eq(memberships.tenantId, scope.tenantId), eq(memberships.status, 'active'), eq(accounts.status, 'active'),
      or(eq(membershipRoleAssignments.scopeKind, 'tenant'), and(eq(membershipRoleAssignments.scopeKind, 'school'), eq(membershipRoleAssignments.schoolId, scope.schoolId))),
      sql`${staffProfiles.id} is null`,
    )).orderBy(accounts.normalizedEmail);
}

export async function isAssignableTeacher(tx: TenantTransaction, scope: StaffScope, membershipId: string): Promise<boolean> {
  const [linked] = await tx.select({ id: staffProfiles.id }).from(staffProfiles)
    .where(and(eq(staffProfiles.tenantId, scope.tenantId), eq(staffProfiles.membershipId, membershipId)))
    .for('update').limit(1);
  if (!linked) return false;
  const [record] = await tx.select({ staffId: staffProfiles.id }).from(staffProfiles)
    .innerJoin(staffSchoolAffiliations, and(
      eq(staffSchoolAffiliations.tenantId, staffProfiles.tenantId), eq(staffSchoolAffiliations.staffId, staffProfiles.id),
    ))
    .innerJoin(teacherProfiles, and(eq(teacherProfiles.tenantId, staffProfiles.tenantId), eq(teacherProfiles.staffId, staffProfiles.id)))
    .where(and(
      eq(staffProfiles.tenantId, scope.tenantId), eq(staffProfiles.membershipId, membershipId),
      eq(staffSchoolAffiliations.schoolId, scope.schoolId), eq(staffSchoolAffiliations.status, 'active'), eq(staffSchoolAffiliations.kind, 'teacher'),
    )).limit(1);
  return Boolean(record) && await activeMemberAtSchool(tx, scope, membershipId);
}

export async function listAssignableTeacherAccounts(tx: TenantTransaction, scope: StaffScope) {
  return tx.selectDistinct({
    id: memberships.id,
    email: accounts.normalizedEmail,
    displayName: sql<string>`concat_ws(' ', coalesce(${staffProfiles.preferredName}, ${staffProfiles.givenName}), ${staffProfiles.familyName})`,
  }).from(staffProfiles)
    .innerJoin(staffSchoolAffiliations, and(
      eq(staffSchoolAffiliations.tenantId, staffProfiles.tenantId), eq(staffSchoolAffiliations.staffId, staffProfiles.id),
    ))
    .innerJoin(teacherProfiles, and(eq(teacherProfiles.tenantId, staffProfiles.tenantId), eq(teacherProfiles.staffId, staffProfiles.id)))
    .innerJoin(memberships, and(eq(memberships.tenantId, staffProfiles.tenantId), eq(memberships.id, staffProfiles.membershipId)))
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .innerJoin(membershipRoleAssignments, and(
      eq(membershipRoleAssignments.tenantId, memberships.tenantId), eq(membershipRoleAssignments.membershipId, memberships.id),
    ))
    .where(and(
      eq(staffProfiles.tenantId, scope.tenantId), eq(staffSchoolAffiliations.schoolId, scope.schoolId),
      eq(staffSchoolAffiliations.status, 'active'), eq(staffSchoolAffiliations.kind, 'teacher'),
      eq(memberships.status, 'active'), eq(accounts.status, 'active'),
      or(eq(membershipRoleAssignments.scopeKind, 'tenant'), and(eq(membershipRoleAssignments.scopeKind, 'school'), eq(membershipRoleAssignments.schoolId, scope.schoolId))),
    )).orderBy(accounts.normalizedEmail);
}
