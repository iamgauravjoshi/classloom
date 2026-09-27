import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm';
import type { TenantTransaction } from './client.js';
import { admissionCaseEvents, admissionCaseGuardians, admissionCases, securityEvents } from './schema.js';

export type AdmissionScope = { tenantId: string; schoolId: string };
export type AdmissionActor = { accountId: string; membershipId: string; requestId?: string };
export type AdmissionStatus = 'enquiry' | 'draft' | 'submitted' | 'under_review' | 'accepted' | 'rejected' | 'withdrawn' | 'admitted';
export type AdmissionTransitionAction = 'draft' | 'submit' | 'start_review' | 'return_to_draft' | 'accept' | 'reject' | 'withdraw' | 'admit';
export type AdmissionRelationship = 'mother' | 'father' | 'legal_guardian' | 'grandparent' | 'sibling' | 'other';

export class AdmissionError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'CONFLICT' | 'INVALID', message: string) {
    super(message);
    this.name = 'AdmissionError';
  }
}

export type AdmissionGuardianInput = {
  guardianProfileId?: string | null; guardianCode?: string | null; givenName: string; middleName?: string | null;
  familyName: string; preferredName?: string | null; email?: string | null; phone?: string | null; occupation?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null; state?: string | null;
  postalCode?: string | null; countryCode?: string | null; relationshipType: AdmissionRelationship; primaryContact?: boolean;
  emergencyContact?: boolean; authorizedPickup?: boolean; financialResponsibility?: boolean; portalAccess?: boolean;
};

export type AdmissionCaseInput = {
  status?: 'enquiry' | 'draft'; studentGivenName?: string | null; studentMiddleName?: string | null;
  studentFamilyName?: string | null; studentPreferredName?: string | null; studentDateOfBirth?: string | null;
  studentGender?: string | null; studentEmail?: string | null; studentPhone?: string | null; existingStudentId?: string | null;
  requestedSessionId?: string | null; requestedClassId?: string | null; requestedSectionId?: string | null;
  reviewNote?: string | null; decisionNote?: string | null; guardians?: AdmissionGuardianInput[];
};

export type AdmissionListFilters = {
  q?: string; status?: AdmissionStatus; requestedSessionId?: string; createdFrom?: string; createdTo?: string; cursor?: string; limit?: number;
};
export type AdmissionConversionReferences = { studentId: string; schoolEnrollmentId: string; academicEnrollmentId: string };

const allowedTransitions: Record<AdmissionStatus, Partial<Record<AdmissionTransitionAction, AdmissionStatus>>> = {
  enquiry: { draft: 'draft', withdraw: 'withdrawn' },
  draft: { submit: 'submitted', withdraw: 'withdrawn' },
  submitted: { return_to_draft: 'draft', start_review: 'under_review', withdraw: 'withdrawn' },
  under_review: { return_to_draft: 'draft', accept: 'accepted', reject: 'rejected', withdraw: 'withdrawn' },
  accepted: { admit: 'admitted' }, rejected: {}, withdrawn: {}, admitted: {},
};
const relationships = new Set<AdmissionRelationship>(['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other']);

export function nextAdmissionStatus(current: AdmissionStatus, action: AdmissionTransitionAction, note?: string | null): AdmissionStatus {
  if (['accept', 'reject'].includes(action) && !note?.trim()) throw new AdmissionError('INVALID', 'A decision note is required');
  if (action === 'withdraw' && !note?.trim()) throw new AdmissionError('INVALID', 'A withdrawal reason is required');
  if (action === 'return_to_draft' && !note?.trim()) throw new AdmissionError('INVALID', 'A reason is required to return the case to draft');
  if (note && note.trim().length > 500) throw new AdmissionError('INVALID', 'The note must be at most 500 characters');
  const next = allowedTransitions[current][action];
  if (!next) throw new AdmissionError('CONFLICT', `An admission case in ${current} status cannot ${action.replaceAll('_', ' ')}`);
  return next;
}

function textValue(value: string | null | undefined, label: string, maximum: number) {
  const trimmed = value?.trim() || null;
  if (trimmed && trimmed.length > maximum) throw new AdmissionError('INVALID', `${label} must be at most ${maximum} characters`);
  return trimmed;
}

function calendarDate(value: string | null | undefined) {
  const normalized = value?.trim() || null;
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new AdmissionError('INVALID', 'Date of birth must be a valid calendar date');
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized) throw new AdmissionError('INVALID', 'Date of birth must be a valid calendar date');
  return normalized;
}

export function normalizeAdmissionCaseInput(input: AdmissionCaseInput) {
  if (input.status && !['enquiry', 'draft'].includes(input.status)) throw new AdmissionError('INVALID', 'A new case must start as an enquiry or draft');
  if ((input.guardians?.length ?? 0) > 10) throw new AdmissionError('INVALID', 'At most 10 guardians can be added');
  const guardians = input.guardians?.map((guardian, index) => {
    if (!relationships.has(guardian.relationshipType)) throw new AdmissionError('INVALID', 'Choose a valid guardian relationship');
    const givenName = textValue(guardian.givenName, 'Guardian given name', 120);
    const familyName = textValue(guardian.familyName, 'Guardian family name', 120);
    if (!givenName || !familyName) throw new AdmissionError('INVALID', 'Guardian given and family names are required');
    return {
      ordinal: index + 1, guardianProfileId: guardian.guardianProfileId ?? null,
      guardianCode: textValue(guardian.guardianCode, 'Guardian code', 20), givenName,
      middleName: textValue(guardian.middleName, 'Guardian middle name', 120), familyName,
      preferredName: textValue(guardian.preferredName, 'Guardian preferred name', 120),
      email: textValue(guardian.email, 'Guardian email', 254), phone: textValue(guardian.phone, 'Guardian phone', 30),
      occupation: textValue(guardian.occupation, 'Guardian occupation', 120),
      addressLine1: textValue(guardian.addressLine1, 'Guardian address', 240),
      addressLine2: textValue(guardian.addressLine2, 'Guardian address', 240),
      city: textValue(guardian.city, 'Guardian city', 120), state: textValue(guardian.state, 'Guardian state', 120),
      postalCode: textValue(guardian.postalCode, 'Guardian postal code', 30), countryCode: textValue(guardian.countryCode, 'Guardian country code', 2),
      relationshipType: guardian.relationshipType, primaryContact: guardian.primaryContact ?? false,
      emergencyContact: guardian.emergencyContact ?? false, authorizedPickup: guardian.authorizedPickup ?? false,
      financialResponsibility: guardian.financialResponsibility ?? false, portalAccess: guardian.portalAccess ?? false,
    };
  });
  return {
    status: input.status ?? 'enquiry', studentGivenName: textValue(input.studentGivenName, 'Student given name', 120),
    studentMiddleName: textValue(input.studentMiddleName, 'Student middle name', 120),
    studentFamilyName: textValue(input.studentFamilyName, 'Student family name', 120),
    studentPreferredName: textValue(input.studentPreferredName, 'Student preferred name', 120),
    studentDateOfBirth: calendarDate(input.studentDateOfBirth), studentGender: textValue(input.studentGender, 'Student gender', 50),
    studentEmail: textValue(input.studentEmail, 'Student email', 254), studentPhone: textValue(input.studentPhone, 'Student phone', 30),
    existingStudentId: input.existingStudentId ?? null, requestedSessionId: input.requestedSessionId ?? null,
    requestedClassId: input.requestedClassId ?? null, requestedSectionId: input.requestedSectionId ?? null,
    reviewNote: textValue(input.reviewNote, 'Review note', 500), decisionNote: textValue(input.decisionNote, 'Decision note', 500),
    guardians,
  };
}

function dbCode(error: unknown): string | undefined {
  const value = error as { code?: string; cause?: { code?: string } };
  return value.code ?? value.cause?.code;
}

async function appendEvent(tx: TenantTransaction, scope: AdmissionScope, caseId: string, actor: AdmissionActor, eventType: string, fromStatus: AdmissionStatus | null, toStatus: AdmissionStatus) {
  await tx.insert(admissionCaseEvents).values({ ...scope, caseId, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId, eventType, fromStatus, toStatus });
  await tx.insert(securityEvents).values({
    tenantId: scope.tenantId, accountId: actor.accountId, requestId: actor.requestId,
    eventType: `admissions_case_${eventType}`, metadata: { schoolId: scope.schoolId, caseId, fromStatus: fromStatus ?? 'none', toStatus },
  });
}

async function insertGuardians(tx: TenantTransaction, scope: AdmissionScope, caseId: string, guardians: NonNullable<ReturnType<typeof normalizeAdmissionCaseInput>['guardians']>) {
  if (guardians.length) await tx.insert(admissionCaseGuardians).values(guardians.map((guardian) => ({ ...scope, caseId, ...guardian })));
}

async function lockCase(tx: TenantTransaction, scope: AdmissionScope, caseId: string) {
  const [record] = await tx.select().from(admissionCases).where(and(
    eq(admissionCases.tenantId, scope.tenantId), eq(admissionCases.schoolId, scope.schoolId), eq(admissionCases.id, caseId),
  )).for('update').limit(1);
  if (!record) throw new AdmissionError('NOT_FOUND', 'Admission case was not found');
  return record;
}

export async function createAdmissionCase(tx: TenantTransaction, scope: AdmissionScope, input: AdmissionCaseInput, actor: AdmissionActor) {
  const normalized = normalizeAdmissionCaseInput(input);
  const { guardians, ...caseValues } = normalized;
  const caseReference = `ADM-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  try {
    const [record] = await tx.insert(admissionCases).values({ ...scope, caseReference, ...caseValues, createdByAccountId: actor.accountId, createdByMembershipId: actor.membershipId }).returning();
    if (!record) throw new Error('Admission case insert did not return a row');
    await insertGuardians(tx, scope, record.id, guardians ?? []);
    await appendEvent(tx, scope, record.id, actor, 'created', null, record.status as AdmissionStatus);
    return getAdmissionCase(tx, scope, record.id);
  } catch (error) {
    if (dbCode(error) === '23505') throw new AdmissionError('CONFLICT', 'Could not allocate a unique case reference; try again');
    throw error;
  }
}

export async function getAdmissionCase(tx: TenantTransaction, scope: AdmissionScope, caseId: string) {
  const [record] = await tx.select().from(admissionCases).where(and(
    eq(admissionCases.tenantId, scope.tenantId), eq(admissionCases.schoolId, scope.schoolId), eq(admissionCases.id, caseId),
  )).limit(1);
  if (!record) throw new AdmissionError('NOT_FOUND', 'Admission case was not found');
  const guardians = await tx.select().from(admissionCaseGuardians).where(and(
    eq(admissionCaseGuardians.tenantId, scope.tenantId), eq(admissionCaseGuardians.schoolId, scope.schoolId), eq(admissionCaseGuardians.caseId, caseId),
  )).orderBy(asc(admissionCaseGuardians.ordinal));
  return { ...record, guardians };
}

function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString('base64url');
}

function decodeCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown };
    if (typeof value.createdAt !== 'string' || typeof value.id !== 'string' || Number.isNaN(Date.parse(value.createdAt))) throw new Error('invalid');
    return { createdAt: new Date(value.createdAt), id: value.id };
  } catch { throw new AdmissionError('INVALID', 'The admission list cursor is invalid'); }
}

export async function listAdmissionCases(tx: TenantTransaction, scope: AdmissionScope, filters: AdmissionListFilters = {}) {
  const limit = Math.max(1, Math.min(100, filters.limit ?? 25));
  const conditions = [eq(admissionCases.tenantId, scope.tenantId), eq(admissionCases.schoolId, scope.schoolId)];
  if (filters.status) conditions.push(eq(admissionCases.status, filters.status));
  if (filters.requestedSessionId) conditions.push(eq(admissionCases.requestedSessionId, filters.requestedSessionId));
  if (filters.createdFrom) conditions.push(gte(admissionCases.createdAt, new Date(`${filters.createdFrom}T00:00:00.000Z`)));
  if (filters.createdTo) conditions.push(lte(admissionCases.createdAt, new Date(`${filters.createdTo}T23:59:59.999Z`)));
  const q = filters.q?.trim().slice(0, 120);
  if (q) {
    const pattern = `%${q}%`;
    conditions.push(or(ilike(admissionCases.caseReference, pattern), ilike(admissionCases.studentGivenName, pattern), ilike(admissionCases.studentFamilyName, pattern), ilike(admissionCases.studentPreferredName, pattern))!);
  }
  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor);
    const createdAtKey = sql`date_trunc('milliseconds', ${admissionCases.createdAt})`;
    const cursorTimestamp = sql`${cursor.createdAt.toISOString()}::timestamptz`;
    conditions.push(sql`(${createdAtKey} < ${cursorTimestamp} or (${createdAtKey} = ${cursorTimestamp} and ${admissionCases.id} < ${cursor.id}::uuid))`);
  }
  const records = await tx.select().from(admissionCases).where(and(...conditions))
    .orderBy(desc(sql`date_trunc('milliseconds', ${admissionCases.createdAt})`), desc(admissionCases.id)).limit(limit + 1);
  const hasMore = records.length > limit;
  const items = records.slice(0, limit);
  return { items, nextCursor: hasMore && items.length ? encodeCursor(items.at(-1)!.createdAt, items.at(-1)!.id) : null };
}

export async function updateAdmissionCase(tx: TenantTransaction, scope: AdmissionScope, caseId: string, input: Partial<AdmissionCaseInput>, actor: AdmissionActor) {
  const current = await lockCase(tx, scope, caseId);
  if (!['enquiry', 'draft'].includes(current.status)) throw new AdmissionError('CONFLICT', 'Only enquiries and drafts can be edited');
  const normalized = normalizeAdmissionCaseInput({ ...input, status: current.status as 'enquiry' | 'draft' });
  const { guardians, status: _status, ...caseValues } = normalized;
  const values = Object.fromEntries(Object.keys(caseValues).filter((key) => Object.prototype.hasOwnProperty.call(input, key)).map((key) => [key, caseValues[key as keyof typeof caseValues]]));
  const [record] = await tx.update(admissionCases).set({ ...values, updatedAt: new Date() }).where(and(
    eq(admissionCases.tenantId, scope.tenantId), eq(admissionCases.schoolId, scope.schoolId), eq(admissionCases.id, caseId),
  )).returning();
  if (!record) throw new AdmissionError('NOT_FOUND', 'Admission case was not found');
  if (input.guardians !== undefined) {
    await tx.delete(admissionCaseGuardians).where(and(eq(admissionCaseGuardians.tenantId, scope.tenantId), eq(admissionCaseGuardians.schoolId, scope.schoolId), eq(admissionCaseGuardians.caseId, caseId)));
    await insertGuardians(tx, scope, caseId, guardians ?? []);
  }
  await appendEvent(tx, scope, caseId, actor, 'updated', current.status as AdmissionStatus, current.status as AdmissionStatus);
  return getAdmissionCase(tx, scope, caseId);
}

export async function transitionAdmissionCase(tx: TenantTransaction, scope: AdmissionScope, caseId: string, action: Exclude<AdmissionTransitionAction, 'admit'>, actor: AdmissionActor, note?: string | null) {
  const current = await lockCase(tx, scope, caseId);
  const fromStatus = current.status as AdmissionStatus;
  const toStatus = nextAdmissionStatus(fromStatus, action, note);
  const update: Record<string, unknown> = { status: toStatus, updatedAt: new Date() };
  if (action === 'start_review' || action === 'return_to_draft') update.reviewNote = note?.trim() || null;
  if (action === 'accept' || action === 'reject' || action === 'withdraw') update.decisionNote = note?.trim() || null;
  const [record] = await tx.update(admissionCases).set(update).where(and(
    eq(admissionCases.tenantId, scope.tenantId), eq(admissionCases.schoolId, scope.schoolId), eq(admissionCases.id, caseId),
  )).returning();
  if (!record) throw new AdmissionError('NOT_FOUND', 'Admission case was not found');
  await appendEvent(tx, scope, caseId, actor, action, fromStatus, toStatus);
  return record;
}

export async function recordAdmissionConversion(tx: TenantTransaction, scope: AdmissionScope, caseId: string, references: AdmissionConversionReferences, actor: AdmissionActor) {
  const current = await lockCase(tx, scope, caseId);
  const fromStatus = current.status as AdmissionStatus;
  const toStatus = nextAdmissionStatus(fromStatus, 'admit');
  const [record] = await tx.update(admissionCases).set({
    status: toStatus, convertedStudentId: references.studentId, convertedSchoolEnrollmentId: references.schoolEnrollmentId,
    convertedAcademicEnrollmentId: references.academicEnrollmentId, updatedAt: new Date(),
  }).where(and(eq(admissionCases.tenantId, scope.tenantId), eq(admissionCases.schoolId, scope.schoolId), eq(admissionCases.id, caseId))).returning();
  if (!record) throw new AdmissionError('NOT_FOUND', 'Admission case was not found');
  await appendEvent(tx, scope, caseId, actor, 'admitted', fromStatus, toStatus);
  return record;
}

export async function listAdmissionCaseEvents(tx: TenantTransaction, scope: AdmissionScope, caseId: string) {
  await getAdmissionCase(tx, scope, caseId);
  return tx.select().from(admissionCaseEvents).where(and(
    eq(admissionCaseEvents.tenantId, scope.tenantId), eq(admissionCaseEvents.schoolId, scope.schoolId), eq(admissionCaseEvents.caseId, caseId),
  )).orderBy(asc(admissionCaseEvents.createdAt), asc(admissionCaseEvents.id));
}
