import { and, asc, eq, gt, ilike, inArray, or, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import {
  accounts,
  guardianProfiles,
  memberships,
  securityEvents,
  studentGuardianRelationships,
  studentProfiles,
} from './schema.js';

export type StudentScope = { tenantId: string; schoolId: string };
export type StudentPeopleAudit = { actorAccountId: string; requestId?: string };
export type StudentProfileInput = {
  studentCode: string;
  givenName: string;
  middleName?: string | null;
  familyName: string;
  preferredName?: string | null;
  dateOfBirth: string;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
};
export type GuardianProfileInput = {
  guardianCode: string;
  givenName: string;
  middleName?: string | null;
  familyName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  occupation?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
};
export type GuardianRelationshipType = 'mother' | 'father' | 'legal_guardian' | 'grandparent' | 'sibling' | 'other';
export type GuardianRelationshipInput = {
  relationshipType: GuardianRelationshipType;
  primaryContact?: boolean;
  emergencyContact?: boolean;
  authorizedPickup?: boolean;
  financialResponsibility?: boolean;
  portalAccess?: boolean;
  status?: 'active' | 'inactive';
};

export class StudentPeopleError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'StudentPeopleError';
  }
}

function dbCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value.code ?? value.cause?.code;
}

export function normalizeStudentCode(value: string, label: 'Student' | 'Guardian' = 'Student'): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code)) {
    throw new StudentPeopleError('INVALID', `${label} code must be 1–20 letters, numbers, hyphens, or underscores`);
  }
  return code;
}

function requiredName(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 120) {
    throw new StudentPeopleError('INVALID', `${label} must be 2–120 characters`);
  }
  return normalized;
}

function optionalText(value: string | null | undefined, label: string, maximum: number): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maximum) {
    throw new StudentPeopleError('INVALID', `${label} must be at most ${maximum} characters`);
  }
  return normalized;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = optionalText(value, 'Email', 254)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new StudentPeopleError('INVALID', 'Email must be a valid email address');
  }
  return email;
}

function normalizeDateOnly(value: string, now: Date): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new StudentPeopleError('INVALID', 'Date of birth must be a valid calendar date');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new StudentPeopleError('INVALID', 'Date of birth must be a valid calendar date');
  }
  if (value > now.toISOString().slice(0, 10)) {
    throw new StudentPeopleError('INVALID', 'Date of birth cannot be in the future');
  }
  return value;
}

export function normalizeStudentProfile(input: StudentProfileInput, now = new Date()) {
  return {
    studentCode: normalizeStudentCode(input.studentCode, 'Student'),
    givenName: requiredName(input.givenName, 'Given name'),
    middleName: optionalText(input.middleName, 'Middle name', 120),
    familyName: requiredName(input.familyName, 'Family name'),
    preferredName: optionalText(input.preferredName, 'Preferred name', 120),
    dateOfBirth: normalizeDateOnly(input.dateOfBirth, now),
    gender: optionalText(input.gender, 'Gender', 50),
    email: normalizeEmail(input.email),
    phone: optionalText(input.phone, 'Phone', 30),
  };
}

export function normalizeGuardianProfile(input: GuardianProfileInput) {
  const countryCode = optionalText(input.countryCode, 'Country code', 2)?.toUpperCase() ?? null;
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    throw new StudentPeopleError('INVALID', 'Country code must use two letters');
  }
  return {
    guardianCode: normalizeStudentCode(input.guardianCode, 'Guardian'),
    givenName: requiredName(input.givenName, 'Given name'),
    middleName: optionalText(input.middleName, 'Middle name', 120),
    familyName: requiredName(input.familyName, 'Family name'),
    preferredName: optionalText(input.preferredName, 'Preferred name', 120),
    email: normalizeEmail(input.email),
    phone: optionalText(input.phone, 'Phone', 30),
    occupation: optionalText(input.occupation, 'Occupation', 120),
    addressLine1: optionalText(input.addressLine1, 'Address line 1', 240),
    addressLine2: optionalText(input.addressLine2, 'Address line 2', 240),
    city: optionalText(input.city, 'City', 120),
    state: optionalText(input.state, 'State', 120),
    postalCode: optionalText(input.postalCode, 'Postal code', 30),
    countryCode,
  };
}

const relationshipTypes = new Set<GuardianRelationshipType>([
  'mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other',
]);

export function normalizeGuardianRelationship(input: GuardianRelationshipInput) {
  const relationshipType = input.relationshipType.trim().toLowerCase() as GuardianRelationshipType;
  if (!relationshipTypes.has(relationshipType)) {
    throw new StudentPeopleError('INVALID', 'Choose a valid guardian relationship');
  }
  if (input.status && input.status !== 'active' && input.status !== 'inactive') {
    throw new StudentPeopleError('INVALID', 'Choose a valid relationship status');
  }
  return {
    relationshipType,
    primaryContact: input.primaryContact ?? false,
    emergencyContact: input.emergencyContact ?? false,
    authorizedPickup: input.authorizedPickup ?? false,
    financialResponsibility: input.financialResponsibility ?? false,
    portalAccess: input.portalAccess ?? false,
    status: input.status ?? 'active' as const,
  };
}

async function audit(
  tx: TenantTransaction,
  tenantId: string,
  eventType: string,
  auditContext: StudentPeopleAudit,
  metadata: Record<string, string>,
) {
  await tx.insert(securityEvents).values({
    eventType,
    tenantId,
    accountId: auditContext.actorAccountId,
    requestId: auditContext.requestId,
    metadata,
  });
}

export async function findStudentByCode(tx: TenantTransaction, tenantId: string, studentCode: string) {
  const code = normalizeStudentCode(studentCode, 'Student');
  const [record] = await tx.select().from(studentProfiles).where(and(
    eq(studentProfiles.tenantId, tenantId),
    sql`upper(trim(${studentProfiles.studentCode})) = ${code}`,
  )).limit(1);
  return record ?? null;
}

export async function createStudentProfile(
  tx: TenantTransaction,
  tenantId: string,
  input: StudentProfileInput,
  auditContext: StudentPeopleAudit,
) {
  const values = normalizeStudentProfile(input);
  try {
    const [created] = await tx.insert(studentProfiles).values({ tenantId, ...values }).returning();
    if (!created) throw new Error('Student insert did not return a row');
    await audit(tx, tenantId, 'student_created', auditContext, { studentId: created.id });
    return created;
  } catch (error) {
    if (dbCode(error) === '23505') throw new StudentPeopleError('CONFLICT', 'A student with this code already exists');
    throw error;
  }
}

export async function readStudentProfile(tx: TenantTransaction, tenantId: string, studentId: string) {
  const [record] = await tx.select().from(studentProfiles).where(and(
    eq(studentProfiles.tenantId, tenantId), eq(studentProfiles.id, studentId),
  )).limit(1);
  if (!record) throw new StudentPeopleError('NOT_FOUND', 'Student was not found');
  return record;
}

export async function listStudentProfilesByIds(
  tx: TenantTransaction,
  tenantId: string,
  studentIds: string[],
  options: { cursor?: string; limit?: number; q?: string; status?: 'active' | 'inactive' } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  if (!studentIds.length) return { items: [], nextCursor: null as string | null };
  const q = options.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const rows = await tx.select().from(studentProfiles).where(and(
    eq(studentProfiles.tenantId, tenantId),
    inArray(studentProfiles.id, studentIds),
    options.cursor ? gt(studentProfiles.id, options.cursor) : undefined,
    options.status ? eq(studentProfiles.status, options.status) : undefined,
    pattern ? or(
      ilike(studentProfiles.studentCode, pattern), ilike(studentProfiles.givenName, pattern),
      ilike(studentProfiles.familyName, pattern), ilike(studentProfiles.preferredName, pattern),
    ) : undefined,
  )).orderBy(asc(studentProfiles.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { items: page, nextCursor: rows.length > limit ? page.at(-1)!.id : null };
}

export async function updateStudentProfile(
  tx: TenantTransaction,
  tenantId: string,
  studentId: string,
  changes: Partial<Omit<StudentProfileInput, 'studentCode'>>,
  auditContext: StudentPeopleAudit,
) {
  const current = await readStudentProfile(tx, tenantId, studentId);
  const normalized = normalizeStudentProfile({
    studentCode: current.studentCode,
    givenName: changes.givenName ?? current.givenName,
    middleName: changes.middleName === undefined ? current.middleName : changes.middleName,
    familyName: changes.familyName ?? current.familyName,
    preferredName: changes.preferredName === undefined ? current.preferredName : changes.preferredName,
    dateOfBirth: changes.dateOfBirth ?? current.dateOfBirth,
    gender: changes.gender === undefined ? current.gender : changes.gender,
    email: changes.email === undefined ? current.email : changes.email,
    phone: changes.phone === undefined ? current.phone : changes.phone,
  });
  const { studentCode: _, ...values } = normalized;
  await tx.update(studentProfiles).set({ ...values, updatedAt: new Date() }).where(and(
    eq(studentProfiles.tenantId, tenantId), eq(studentProfiles.id, studentId),
  ));
  await audit(tx, tenantId, 'student_updated', auditContext, { studentId, changedFields: Object.keys(changes).sort().join(',') });
  return readStudentProfile(tx, tenantId, studentId);
}

export async function setStudentStatus(
  tx: TenantTransaction,
  tenantId: string,
  studentId: string,
  status: 'active' | 'inactive',
  auditContext: StudentPeopleAudit,
) {
  await readStudentProfile(tx, tenantId, studentId);
  await tx.update(studentProfiles).set({ status, updatedAt: new Date() }).where(and(
    eq(studentProfiles.tenantId, tenantId), eq(studentProfiles.id, studentId),
  ));
  await audit(tx, tenantId, 'student_status_changed', auditContext, { studentId, status });
  return readStudentProfile(tx, tenantId, studentId);
}

export async function findGuardianByCode(tx: TenantTransaction, tenantId: string, guardianCode: string) {
  const code = normalizeStudentCode(guardianCode, 'Guardian');
  const [record] = await tx.select().from(guardianProfiles).where(and(
    eq(guardianProfiles.tenantId, tenantId),
    sql`upper(trim(${guardianProfiles.guardianCode})) = ${code}`,
  )).limit(1);
  return record ?? null;
}

export async function createGuardianProfile(
  tx: TenantTransaction,
  tenantId: string,
  input: GuardianProfileInput,
  auditContext: StudentPeopleAudit,
) {
  const values = normalizeGuardianProfile(input);
  try {
    const [created] = await tx.insert(guardianProfiles).values({ tenantId, ...values }).returning();
    if (!created) throw new Error('Guardian insert did not return a row');
    await audit(tx, tenantId, 'guardian_created', auditContext, { guardianId: created.id });
    return created;
  } catch (error) {
    if (dbCode(error) === '23505') throw new StudentPeopleError('CONFLICT', 'A guardian with this code already exists');
    throw error;
  }
}

export async function readGuardianProfile(tx: TenantTransaction, tenantId: string, guardianId: string) {
  const [record] = await tx.select().from(guardianProfiles).where(and(
    eq(guardianProfiles.tenantId, tenantId), eq(guardianProfiles.id, guardianId),
  )).limit(1);
  if (!record) throw new StudentPeopleError('NOT_FOUND', 'Guardian was not found');
  return record;
}

export async function lockStudentForScope(tx: TenantTransaction, tenantId: string, studentId: string) {
  const [student] = await tx.select({ id: studentProfiles.id }).from(studentProfiles).where(and(
    eq(studentProfiles.tenantId, tenantId), eq(studentProfiles.id, studentId),
  )).for('update').limit(1);
  if (!student) throw new StudentPeopleError('NOT_FOUND', 'Student was not found');
}

export async function lockGuardianForScope(tx: TenantTransaction, tenantId: string, guardianId: string) {
  const [guardian] = await tx.select({ id: guardianProfiles.id }).from(guardianProfiles).where(and(
    eq(guardianProfiles.tenantId, tenantId), eq(guardianProfiles.id, guardianId),
  )).for('update').limit(1);
  if (!guardian) throw new StudentPeopleError('NOT_FOUND', 'Guardian was not found');
}

export async function lockActiveStudentGuardiansForScope(tx: TenantTransaction, tenantId: string, studentId: string) {
  const guardians = await tx.select({ guardianId: studentGuardianRelationships.guardianId }).from(studentGuardianRelationships).where(and(
    eq(studentGuardianRelationships.tenantId, tenantId), eq(studentGuardianRelationships.studentId, studentId),
    eq(studentGuardianRelationships.status, 'active'),
  )).orderBy(asc(studentGuardianRelationships.guardianId));
  for (const { guardianId } of guardians) await lockGuardianForScope(tx, tenantId, guardianId);
}

export async function listGuardianProfilesByIds(
  tx: TenantTransaction,
  tenantId: string,
  guardianIds: string[],
  options: { cursor?: string; limit?: number; q?: string; status?: 'active' | 'inactive' } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  if (!guardianIds.length) return { items: [], nextCursor: null as string | null };
  const q = options.q?.trim();
  const pattern = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const rows = await tx.select().from(guardianProfiles).where(and(
    eq(guardianProfiles.tenantId, tenantId),
    inArray(guardianProfiles.id, guardianIds),
    options.cursor ? gt(guardianProfiles.id, options.cursor) : undefined,
    options.status ? eq(guardianProfiles.status, options.status) : undefined,
    pattern ? or(
      ilike(guardianProfiles.guardianCode, pattern), ilike(guardianProfiles.givenName, pattern),
      ilike(guardianProfiles.familyName, pattern), ilike(guardianProfiles.preferredName, pattern),
    ) : undefined,
  )).orderBy(asc(guardianProfiles.id)).limit(limit + 1);
  const page = rows.slice(0, limit);
  return { items: page, nextCursor: rows.length > limit ? page.at(-1)!.id : null };
}

export async function updateGuardianProfile(
  tx: TenantTransaction,
  tenantId: string,
  guardianId: string,
  changes: Partial<Omit<GuardianProfileInput, 'guardianCode'>>,
  auditContext: StudentPeopleAudit,
) {
  const current = await readGuardianProfile(tx, tenantId, guardianId);
  const normalized = normalizeGuardianProfile({
    guardianCode: current.guardianCode,
    givenName: changes.givenName ?? current.givenName,
    middleName: changes.middleName === undefined ? current.middleName : changes.middleName,
    familyName: changes.familyName ?? current.familyName,
    preferredName: changes.preferredName === undefined ? current.preferredName : changes.preferredName,
    email: changes.email === undefined ? current.email : changes.email,
    phone: changes.phone === undefined ? current.phone : changes.phone,
    occupation: changes.occupation === undefined ? current.occupation : changes.occupation,
    addressLine1: changes.addressLine1 === undefined ? current.addressLine1 : changes.addressLine1,
    addressLine2: changes.addressLine2 === undefined ? current.addressLine2 : changes.addressLine2,
    city: changes.city === undefined ? current.city : changes.city,
    state: changes.state === undefined ? current.state : changes.state,
    postalCode: changes.postalCode === undefined ? current.postalCode : changes.postalCode,
    countryCode: changes.countryCode === undefined ? current.countryCode : changes.countryCode,
  });
  const { guardianCode: _, ...values } = normalized;
  await tx.update(guardianProfiles).set({ ...values, updatedAt: new Date() }).where(and(
    eq(guardianProfiles.tenantId, tenantId), eq(guardianProfiles.id, guardianId),
  ));
  await audit(tx, tenantId, 'guardian_updated', auditContext, { guardianId, changedFields: Object.keys(changes).sort().join(',') });
  return readGuardianProfile(tx, tenantId, guardianId);
}

export async function setGuardianStatus(
  tx: TenantTransaction,
  tenantId: string,
  guardianId: string,
  status: 'active' | 'inactive',
  auditContext: StudentPeopleAudit,
) {
  await readGuardianProfile(tx, tenantId, guardianId);
  await tx.update(guardianProfiles).set({ status, updatedAt: new Date() }).where(and(
    eq(guardianProfiles.tenantId, tenantId), eq(guardianProfiles.id, guardianId),
  ));
  await audit(tx, tenantId, 'guardian_status_changed', auditContext, { guardianId, status });
  return readGuardianProfile(tx, tenantId, guardianId);
}

export async function createOrUpdateGuardianRelationship(
  tx: TenantTransaction,
  tenantId: string,
  studentId: string,
  guardianId: string,
  input: GuardianRelationshipInput,
  auditContext: StudentPeopleAudit,
) {
  await lockStudentForScope(tx, tenantId, studentId);
  await lockGuardianForScope(tx, tenantId, guardianId);
  await Promise.all([
    readStudentProfile(tx, tenantId, studentId),
    readGuardianProfile(tx, tenantId, guardianId),
  ]);
  const values = normalizeGuardianRelationship(input);
  const [record] = await tx.insert(studentGuardianRelationships).values({
    tenantId, studentId, guardianId, ...values,
  }).onConflictDoUpdate({
    target: [
      studentGuardianRelationships.tenantId,
      studentGuardianRelationships.studentId,
      studentGuardianRelationships.guardianId,
    ],
    set: {
      relationshipType: values.relationshipType,
      ...(input.primaryContact !== undefined ? { primaryContact: values.primaryContact } : {}),
      ...(input.emergencyContact !== undefined ? { emergencyContact: values.emergencyContact } : {}),
      ...(input.authorizedPickup !== undefined ? { authorizedPickup: values.authorizedPickup } : {}),
      ...(input.financialResponsibility !== undefined ? { financialResponsibility: values.financialResponsibility } : {}),
      ...(input.portalAccess !== undefined ? { portalAccess: values.portalAccess } : {}),
      ...(input.status !== undefined ? { status: values.status } : {}),
      updatedAt: new Date(),
    },
  }).returning();
  if (!record) throw new Error('Guardian relationship write did not return a row');
  await audit(tx, tenantId, 'student_guardian_relationship_saved', auditContext, {
    relationshipId: record.id, studentId, guardianId,
  });
  return record;
}

export async function updateGuardianRelationship(
  tx: TenantTransaction,
  tenantId: string,
  studentId: string,
  relationshipId: string,
  changes: Partial<GuardianRelationshipInput>,
  auditContext: StudentPeopleAudit,
) {
  await lockStudentForScope(tx, tenantId, studentId);
  const [current] = await tx.select().from(studentGuardianRelationships).where(and(
    eq(studentGuardianRelationships.tenantId, tenantId),
    eq(studentGuardianRelationships.studentId, studentId),
    eq(studentGuardianRelationships.id, relationshipId),
  )).limit(1);
  if (!current) throw new StudentPeopleError('NOT_FOUND', 'Guardian relationship was not found');
  await lockGuardianForScope(tx, tenantId, current.guardianId);
  const values = normalizeGuardianRelationship({
    relationshipType: changes.relationshipType ?? current.relationshipType as GuardianRelationshipType,
    primaryContact: changes.primaryContact ?? current.primaryContact,
    emergencyContact: changes.emergencyContact ?? current.emergencyContact,
    authorizedPickup: changes.authorizedPickup ?? current.authorizedPickup,
    financialResponsibility: changes.financialResponsibility ?? current.financialResponsibility,
    portalAccess: changes.portalAccess ?? current.portalAccess,
    status: changes.status ?? current.status as 'active' | 'inactive',
  });
  const [updated] = await tx.update(studentGuardianRelationships).set({ ...values, updatedAt: new Date() }).where(and(
    eq(studentGuardianRelationships.tenantId, tenantId), eq(studentGuardianRelationships.id, relationshipId),
  )).returning();
  await audit(tx, tenantId, 'student_guardian_relationship_updated', auditContext, {
    relationshipId, studentId, guardianId: current.guardianId,
  });
  return updated!;
}

export async function listStudentGuardians(tx: TenantTransaction, tenantId: string, studentId: string) {
  await readStudentProfile(tx, tenantId, studentId);
  return tx.select({ relationship: studentGuardianRelationships, guardian: guardianProfiles })
    .from(studentGuardianRelationships)
    .innerJoin(guardianProfiles, and(
      eq(guardianProfiles.tenantId, studentGuardianRelationships.tenantId),
      eq(guardianProfiles.id, studentGuardianRelationships.guardianId),
    ))
    .where(and(
      eq(studentGuardianRelationships.tenantId, tenantId),
      eq(studentGuardianRelationships.studentId, studentId),
    )).orderBy(asc(guardianProfiles.familyName), asc(guardianProfiles.givenName));
}

export async function findStudentGuardianRelationship(tx: TenantTransaction, tenantId: string, studentId: string, guardianId: string) {
  const [relationship] = await tx.select().from(studentGuardianRelationships).where(and(
    eq(studentGuardianRelationships.tenantId, tenantId),
    eq(studentGuardianRelationships.studentId, studentId),
    eq(studentGuardianRelationships.guardianId, guardianId),
  )).limit(1);
  return relationship ?? null;
}

export async function listGuardianStudents(tx: TenantTransaction, tenantId: string, guardianId: string) {
  await readGuardianProfile(tx, tenantId, guardianId);
  return tx.select({ relationship: studentGuardianRelationships, student: studentProfiles })
    .from(studentGuardianRelationships)
    .innerJoin(studentProfiles, and(
      eq(studentProfiles.tenantId, studentGuardianRelationships.tenantId),
      eq(studentProfiles.id, studentGuardianRelationships.studentId),
    ))
    .where(and(
      eq(studentGuardianRelationships.tenantId, tenantId),
      eq(studentGuardianRelationships.guardianId, guardianId),
    )).orderBy(asc(studentProfiles.familyName), asc(studentProfiles.givenName));
}

async function requireActiveMembership(tx: TenantTransaction, tenantId: string, membershipId: string) {
  const [membership] = await tx.select({ id: memberships.id }).from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(
      eq(memberships.tenantId, tenantId), eq(memberships.id, membershipId),
      eq(memberships.status, 'active'), eq(accounts.status, 'active'),
    )).limit(1);
  if (!membership) throw new StudentPeopleError('INVALID', 'The linked account and tenant membership must be active');
}

async function hasLinkHistory(
  tx: TenantTransaction,
  tenantId: string,
  profileKind: 'student' | 'guardian',
  profileId: string,
) {
  const metadataKey = profileKind === 'student' ? 'studentId' : 'guardianId';
  const [event] = await tx.select({ id: securityEvents.id }).from(securityEvents).where(and(
    eq(securityEvents.tenantId, tenantId),
    or(
      eq(securityEvents.eventType, `${profileKind}_account_linked`),
      eq(securityEvents.eventType, `${profileKind}_account_unlinked`),
    ),
    sql`${securityEvents.metadata} ->> ${metadataKey} = ${profileId}`,
  )).limit(1);
  return Boolean(event);
}

async function linkMembership(
  tx: TenantTransaction,
  tenantId: string,
  kind: 'student' | 'guardian',
  profileId: string,
  membershipId: string,
  auditContext: StudentPeopleAudit,
) {
  const table = kind === 'student' ? studentProfiles : guardianProfiles;
  const id = table.id;
  const current = kind === 'student'
    ? (await tx.select().from(studentProfiles).where(and(eq(studentProfiles.tenantId, tenantId), eq(studentProfiles.id, profileId))).for('update').limit(1))[0]
    : (await tx.select().from(guardianProfiles).where(and(eq(guardianProfiles.tenantId, tenantId), eq(guardianProfiles.id, profileId))).for('update').limit(1))[0];
  if (!current) throw new StudentPeopleError('NOT_FOUND', `${kind === 'student' ? 'Student' : 'Guardian'} profile was not found`);
  if (current.membershipId === membershipId) return current;
  if (current.membershipId || await hasLinkHistory(tx, tenantId, kind, profileId)) {
    throw new StudentPeopleError('CONFLICT', `This ${kind} account link has history and cannot be replaced`);
  }
  await requireActiveMembership(tx, tenantId, membershipId);
  try {
    await tx.update(table).set({ membershipId, updatedAt: new Date() }).where(and(
      eq(table.tenantId, tenantId), eq(id, profileId),
    ));
  } catch (error) {
    if (dbCode(error) === '23505') throw new StudentPeopleError('CONFLICT', `This account is already linked to another ${kind}`);
    throw error;
  }
  await audit(tx, tenantId, `${kind}_account_linked`, auditContext, {
    [`${kind}Id`]: profileId, membershipId,
  });
  return kind === 'student'
    ? readStudentProfile(tx, tenantId, profileId)
    : readGuardianProfile(tx, tenantId, profileId);
}

async function unlinkMembership(
  tx: TenantTransaction,
  tenantId: string,
  kind: 'student' | 'guardian',
  profileId: string,
  auditContext: StudentPeopleAudit,
) {
  const table = kind === 'student' ? studentProfiles : guardianProfiles;
  const id = table.id;
  const current = kind === 'student'
    ? (await tx.select().from(studentProfiles).where(and(eq(studentProfiles.tenantId, tenantId), eq(studentProfiles.id, profileId))).for('update').limit(1))[0]
    : (await tx.select().from(guardianProfiles).where(and(eq(guardianProfiles.tenantId, tenantId), eq(guardianProfiles.id, profileId))).for('update').limit(1))[0];
  if (!current) throw new StudentPeopleError('NOT_FOUND', `${kind === 'student' ? 'Student' : 'Guardian'} profile was not found`);
  if (!current.membershipId) return current;
  await tx.update(table).set({ membershipId: null, updatedAt: new Date() }).where(and(
    eq(table.tenantId, tenantId), eq(id, profileId),
  ));
  await audit(tx, tenantId, `${kind}_account_unlinked`, auditContext, {
    [`${kind}Id`]: profileId, membershipId: current.membershipId,
  });
  return kind === 'student'
    ? readStudentProfile(tx, tenantId, profileId)
    : readGuardianProfile(tx, tenantId, profileId);
}

export function linkStudentMembership(tx: TenantTransaction, tenantId: string, studentId: string, membershipId: string, auditContext: StudentPeopleAudit) {
  return linkMembership(tx, tenantId, 'student', studentId, membershipId, auditContext);
}

export function unlinkStudentMembership(tx: TenantTransaction, tenantId: string, studentId: string, auditContext: StudentPeopleAudit) {
  return unlinkMembership(tx, tenantId, 'student', studentId, auditContext);
}

export function linkGuardianMembership(tx: TenantTransaction, tenantId: string, guardianId: string, membershipId: string, auditContext: StudentPeopleAudit) {
  return linkMembership(tx, tenantId, 'guardian', guardianId, membershipId, auditContext);
}

export function unlinkGuardianMembership(tx: TenantTransaction, tenantId: string, guardianId: string, auditContext: StudentPeopleAudit) {
  return unlinkMembership(tx, tenantId, 'guardian', guardianId, auditContext);
}

export async function listEligibleStudentAccounts(tx: TenantTransaction, tenantId: string) {
  return tx.select({ id: memberships.id, email: accounts.normalizedEmail, displayName: accounts.displayName })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .leftJoin(studentProfiles, and(eq(studentProfiles.tenantId, memberships.tenantId), eq(studentProfiles.membershipId, memberships.id)))
    .where(and(
      eq(memberships.tenantId, tenantId), eq(memberships.status, 'active'), eq(accounts.status, 'active'),
      sql`${studentProfiles.id} is null`,
    )).orderBy(asc(accounts.normalizedEmail));
}

export async function listEligibleGuardianAccounts(tx: TenantTransaction, tenantId: string) {
  return tx.select({ id: memberships.id, email: accounts.normalizedEmail, displayName: accounts.displayName })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .leftJoin(guardianProfiles, and(eq(guardianProfiles.tenantId, memberships.tenantId), eq(guardianProfiles.membershipId, memberships.id)))
    .where(and(
      eq(memberships.tenantId, tenantId), eq(memberships.status, 'active'), eq(accounts.status, 'active'),
      sql`${guardianProfiles.id} is null`,
    )).orderBy(asc(accounts.normalizedEmail));
}
