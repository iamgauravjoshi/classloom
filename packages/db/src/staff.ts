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
import { and, eq, gt, ilike, or, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { schools, securityEvents, staffProfiles, staffSchoolAffiliations, teacherProfiles } from './schema.js';
