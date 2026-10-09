import { and, asc, eq } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { TenantTransaction } from './client.js';
import { exams, examAssessments, examMarks, examCorrections, examEvents } from './schema.js';
import type { AttendanceRosterStudent } from './attendance.js';

export type ExamScope = { tenantId: string; schoolId: string };
export type ExamActor = { accountId: string; membershipId: string; requestId: string };
export type MarkStatus = 'unmarked' | 'scored' | 'absent' | 'exempt';
export type MarkValue = { status: MarkStatus; score: number | null };
export type MarkInput = MarkValue & { markId: string };
export class ExaminationError extends Error {
  constructor(readonly code: 'INVALID' | 'NOT_FOUND' | 'CONFLICT', message: string) { super(message); this.name = 'ExaminationError'; }
}
const whereScope = (t: { tenantId: AnyPgColumn; schoolId: AnyPgColumn }, s: ExamScope) => and(eq(t.tenantId, s.tenantId), eq(t.schoolId, s.schoolId));
const invalid = (message: string): never => { throw new ExaminationError('INVALID', message); };
const conflict = (message: string): never => { throw new ExaminationError('CONFLICT', message); };
export function assertVersion(actual: number, expected: number) {
  if (actual !== expected) conflict('This examination changed in another session. Refresh before saving');
}
export function validateMark(value: MarkValue, maximum: number, complete = false): MarkValue {
  if (!['unmarked', 'scored', 'absent', 'exempt'].includes(value.status)) invalid('Choose a valid marks outcome');
  if (value.status === 'scored') {
    if (!Number.isInteger(value.score) || value.score === null || value.score < 0 || value.score > maximum) invalid('Marks must be between zero and the assessment maximum, with at most two decimal places');
  } else if (value.score !== null) invalid('Absent, exempt, and unmarked entries cannot include a score');
  if (complete && value.status === 'unmarked') invalid('Set marks, absent, or exempt for every student before submitting');
  return value;
}
function reason(value: string) { const text = value.trim(); if (!text || text.length > 1000) invalid('Enter a reason between 1 and 1,000 characters'); return text; }
async function event(tx: TenantTransaction, scope: ExamScope, examId: string, assessmentId: string | null, eventType: string, details: Record<string, unknown>, actor: ExamActor) {
  await tx.insert(examEvents).values({ ...scope, examId, assessmentId, eventType, details, actorAccountId: actor.accountId, actorMembershipId: actor.membershipId, requestId: actor.requestId });
}
export async function getExam(tx: TenantTransaction, scope: ExamScope, id: string, lock = false) {
  const query = tx.select().from(exams).where(and(whereScope(exams, scope), eq(exams.id, id)));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw new ExaminationError('NOT_FOUND', 'Examination was not found in this school');
  return row;
}
export async function getAssessment(tx: TenantTransaction, scope: ExamScope, id: string, lock = false) {
  const query = tx.select().from(examAssessments).where(and(whereScope(examAssessments, scope), eq(examAssessments.id, id)));
  const [row] = await (lock ? query.for('update') : query);
  if (!row) throw new ExaminationError('NOT_FOUND', 'Assessment was not found in this school');
  return row;
}
export function listExams(tx: TenantTransaction, scope: ExamScope) {
  return tx.select().from(exams).where(whereScope(exams, scope)).orderBy(asc(exams.startDate), asc(exams.name));
}
export function listAssessments(tx: TenantTransaction, scope: ExamScope, examId: string) {
  return tx.select().from(examAssessments).where(and(whereScope(examAssessments, scope), eq(examAssessments.examId, examId))).orderBy(asc(examAssessments.assessmentDate), asc(examAssessments.label));
}
export async function createExam(tx: TenantTransaction, scope: ExamScope, input: { sessionId: string; classId: string; name: string; startDate: string; endDate: string }, actor: ExamActor) {
  const [row] = await tx.insert(exams).values({ ...scope, ...input, name: input.name.trim() }).returning();
  await event(tx, scope, row.id, null, 'exam_created', { name: row.name }, actor); return row;
}
export async function addAssessment(tx: TenantTransaction, scope: ExamScope, examId: string, input: { expectedVersion: number; sectionId: string; subjectId: string; label: string; assessmentDate: string; maximumScore: number; passingScore: number }, actor: ExamActor) {
  const exam = await getExam(tx, scope, examId, true); assertVersion(exam.version, input.expectedVersion);
  if (exam.status !== 'draft') conflict('Assessments can only be configured while the exam is draft');
  if (input.assessmentDate < exam.startDate || input.assessmentDate > exam.endDate) invalid('Assessment date must be within the examination dates');
  if (!Number.isInteger(input.maximumScore) || input.maximumScore < 1 || input.maximumScore > 100000 || !Number.isInteger(input.passingScore) || input.passingScore < 0 || input.passingScore > input.maximumScore) invalid('Maximum marks must be greater than zero and passing marks cannot exceed the maximum');
  const { expectedVersion: _version, ...values } = input;
  const [row] = await tx.insert(examAssessments).values({ ...scope, ...values, label: values.label.trim(), examId, sessionId: exam.sessionId, classId: exam.classId }).returning();
  await tx.update(exams).set({ version: exam.version + 1 }).where(and(whereScope(exams, scope), eq(exams.id, examId)));
  await event(tx, scope, examId, row.id, 'assessment_added', { ...values }, actor); return row;
}
export async function openExam(tx: TenantTransaction, scope: ExamScope, examId: string, expectedVersion: number, rosters: Map<string, AttendanceRosterStudent[]>, actor: ExamActor) {
  const exam = await getExam(tx, scope, examId, true); assertVersion(exam.version, expectedVersion);
  if (exam.status !== 'draft') conflict('Only a draft examination can be opened');
  const assessments = await listAssessments(tx, scope, examId);
  if (!assessments.length) invalid('Add at least one assessment before opening the examination');
  for (const assessment of assessments) {
    const roster = rosters.get(assessment.id) ?? [];
    if (!roster.length || new Set(roster.map((r) => r.academicEnrollmentId)).size !== roster.length) invalid('Every assessment needs a nonempty enrolled student roster');
    await tx.insert(examMarks).values(roster.map(({ academicEnrollmentId, displayName, rollNumber }) => ({ ...scope, assessmentId: assessment.id, academicEnrollmentId, displayName, rollNumber })));
  }
  const [row] = await tx.update(exams).set({ status: 'open', version: exam.version + 1 }).where(and(whereScope(exams, scope), eq(exams.id, examId))).returning();
  await event(tx, scope, examId, null, 'exam_opened', { rosterCounts: Object.fromEntries([...rosters].map(([id, rows]) => [id, rows.length])) }, actor); return row;
}
export async function readExamSheet(tx: TenantTransaction, scope: ExamScope, assessmentId: string) {
  const reference = await getAssessment(tx, scope, assessmentId);
  // Follow the writer lock order so the version and marks describe the same committed sheet.
  const [exam] = await tx.select().from(exams).where(and(whereScope(exams, scope), eq(exams.id, reference.examId))).for('share');
  const [assessment] = await tx.select().from(examAssessments).where(and(whereScope(examAssessments, scope), eq(examAssessments.id, assessmentId))).for('share');
  if (!exam || !assessment) throw new ExaminationError('NOT_FOUND', 'Assessment was not found in this school');
  const marks = await tx.select().from(examMarks).where(and(whereScope(examMarks, scope), eq(examMarks.assessmentId, assessmentId))).orderBy(asc(examMarks.rollNumber), asc(examMarks.displayName), asc(examMarks.id));
  const corrections = await tx.select().from(examCorrections).where(and(whereScope(examCorrections, scope), eq(examCorrections.assessmentId, assessmentId))).orderBy(asc(examCorrections.createdAt));
  const events = await tx.select().from(examEvents).where(and(whereScope(examEvents, scope), eq(examEvents.assessmentId, assessmentId))).orderBy(asc(examEvents.createdAt), asc(examEvents.id));
  return { exam, assessment, marks, corrections, events };
}
async function lockedContext(tx: TenantTransaction, scope: ExamScope, assessmentId: string, expectedVersion: number) {
  const reference = await getAssessment(tx, scope, assessmentId);
  const exam = await getExam(tx, scope, reference.examId, true);
  const assessment = await getAssessment(tx, scope, assessmentId, true); assertVersion(assessment.version, expectedVersion);
  return { exam, assessment };
}
async function bumpSheet(tx: TenantTransaction, scope: ExamScope, id: string, version: number, status?: string) {
  await tx.update(examAssessments).set({ version: version + 1, ...(status ? { status } : {}) }).where(and(whereScope(examAssessments, scope), eq(examAssessments.id, id)));
}
export async function saveExamMarks(tx: TenantTransaction, scope: ExamScope, assessmentId: string, expectedVersion: number, entries: MarkInput[], actor: ExamActor) {
  const { exam, assessment } = await lockedContext(tx, scope, assessmentId, expectedVersion);
  if (exam.status !== 'open' || assessment.status !== 'draft') conflict('Marks can only be edited in an open exam with a draft sheet');
  const { marks } = await readExamSheet(tx, scope, assessmentId);
  const byId = new Map(entries.map((entry) => [entry.markId, entry]));
  if (!marks.length || byId.size !== entries.length || entries.length !== marks.length || marks.some((mark) => !byId.has(mark.id))) conflict('Save the complete roster shown in this marks sheet');
  const changes = [];
  for (const mark of marks) {
    const next = validateMark(byId.get(mark.id)!, assessment.maximumScore);
    if (next.status === mark.status && next.score === mark.score) continue;
    await tx.update(examMarks).set({ status: next.status, score: next.score, revision: mark.revision + 1 }).where(and(whereScope(examMarks, scope), eq(examMarks.id, mark.id)));
    changes.push({ markId: mark.id, previous: { status: mark.status, score: mark.score }, next: { status: next.status, score: next.score } });
  }
  await bumpSheet(tx, scope, assessmentId, assessment.version);
  await event(tx, scope, exam.id, assessmentId, 'marks_saved', { changes }, actor);
  return readExamSheet(tx, scope, assessmentId);
}
export async function transitionExamSheet(tx: TenantTransaction, scope: ExamScope, assessmentId: string, expectedVersion: number, action: 'submit' | 'return' | 'lock', note: string | undefined, actor: ExamActor) {
  const { exam, assessment } = await lockedContext(tx, scope, assessmentId, expectedVersion);
  if (exam.status !== 'open') conflict('Sheet review requires an open examination');
  const expected = action === 'submit' ? 'draft' : 'submitted';
  if (assessment.status !== expected) conflict(`This sheet must be ${expected} before this action`);
  const { marks } = await readExamSheet(tx, scope, assessmentId);
  if (!marks.length) invalid('This sheet has no enrolled students');
  if (action === 'submit') for (const mark of marks) validateMark(mark as MarkValue, assessment.maximumScore, true);
  const next = action === 'submit' ? 'submitted' : action === 'return' ? 'draft' : 'locked';
  const reviewReason = action === 'return' ? reason(note ?? '') : note?.trim();
  await bumpSheet(tx, scope, assessmentId, assessment.version, next);
  await event(tx, scope, exam.id, assessmentId, `sheet_${action}`, { previousStatus: assessment.status, status: next, reason: reviewReason ?? null }, actor);
  return readExamSheet(tx, scope, assessmentId);
}
export async function requestExamCorrection(tx: TenantTransaction, scope: ExamScope, assessmentId: string, expectedVersion: number, markId: string, proposal: MarkValue & { reason: string }, actor: ExamActor) {
  const { exam, assessment } = await lockedContext(tx, scope, assessmentId, expectedVersion);
  if (assessment.status !== 'locked') conflict('Corrections are only available for locked marks');
  validateMark(proposal, assessment.maximumScore, true);
  const { marks, corrections } = await readExamSheet(tx, scope, assessmentId);
  const mark = marks.find((entry) => entry.id === markId);
  if (!mark) throw new ExaminationError('NOT_FOUND', 'Student mark was not found in this assessment');
  if (corrections.some((entry) => entry.markId === markId && entry.status === 'pending')) conflict('A correction for this student is already awaiting review');
  if (mark.status === proposal.status && mark.score === proposal.score) invalid('A correction must change the marks outcome');
  const [correction] = await tx.insert(examCorrections).values({ ...scope, assessmentId, markId, baseRevision: mark.revision, previousStatus: mark.status, previousScore: mark.score, proposedStatus: proposal.status, proposedScore: proposal.score, reason: reason(proposal.reason), requestedByAccountId: actor.accountId, requestedByMembershipId: actor.membershipId }).returning();
  await bumpSheet(tx, scope, assessmentId, assessment.version);
  await event(tx, scope, exam.id, assessmentId, 'correction_requested', { correctionId: correction.id, markId, previous: { status: mark.status, score: mark.score }, proposed: { status: proposal.status, score: proposal.score }, reason: correction.reason }, actor);
  return readExamSheet(tx, scope, assessmentId);
}
export async function decideExamCorrection(tx: TenantTransaction, scope: ExamScope, assessmentId: string, expectedVersion: number, correctionId: string, decision: 'approve' | 'reject', note: string, actor: ExamActor) {
  const { exam, assessment } = await lockedContext(tx, scope, assessmentId, expectedVersion);
  if (assessment.status !== 'locked') conflict('Correction review requires a locked sheet');
  const { marks, corrections } = await readExamSheet(tx, scope, assessmentId);
  const correction = corrections.find((entry) => entry.id === correctionId);
  if (!correction) throw new ExaminationError('NOT_FOUND', 'Correction request was not found');
  if (correction.status !== 'pending') conflict('This correction has already been reviewed');
  if (correction.requestedByAccountId === actor.accountId) invalid('Another authorized account must review your correction');
  const mark = marks.find((entry) => entry.id === correction.markId)!;
  if (mark.revision !== correction.baseRevision) conflict('The mark changed after this request. Refresh before reviewing');
  if (decision === 'approve') {
    validateMark({ status: correction.proposedStatus as MarkStatus, score: correction.proposedScore }, assessment.maximumScore, true);
    await tx.update(examMarks).set({ status: correction.proposedStatus, score: correction.proposedScore, revision: mark.revision + 1 }).where(and(whereScope(examMarks, scope), eq(examMarks.id, mark.id)));
  }
  await tx.update(examCorrections).set({ status: decision === 'approve' ? 'approved' : 'rejected', decisionReason: reason(note), decidedByAccountId: actor.accountId }).where(and(whereScope(examCorrections, scope), eq(examCorrections.id, correctionId)));
  await bumpSheet(tx, scope, assessmentId, assessment.version);
  await event(tx, scope, exam.id, assessmentId, `correction_${decision}`, { correctionId, markId: mark.id, reason: note.trim() }, actor);
  return readExamSheet(tx, scope, assessmentId);
}
export async function completeExam(tx: TenantTransaction, scope: ExamScope, examId: string, expectedVersion: number, actor: ExamActor) {
  const exam = await getExam(tx, scope, examId, true); assertVersion(exam.version, expectedVersion);
  if (exam.status !== 'open') conflict('Only an open examination can be completed');
  const assessments = await listAssessments(tx, scope, examId);
  if (!assessments.length || assessments.some((a) => a.status !== 'locked')) invalid('Lock every assessment sheet before completing the examination');
  for (const a of assessments) {
    const { corrections } = await readExamSheet(tx, scope, a.id);
    if (corrections.some((c) => c.status === 'pending')) invalid('Review pending corrections before completing the examination');
  }
  const [row] = await tx.update(exams).set({ status: 'completed', version: exam.version + 1 }).where(and(whereScope(exams, scope), eq(exams.id, examId))).returning();
  await event(tx, scope, examId, null, 'exam_completed', {}, actor); return row;
}

/** Results source is serialized with marks/corrections by locking the owning exam first. */
export async function readResultExamSource(
  tx: TenantTransaction,
  scope: ExamScope,
  examId: string,
) {
  const exam = await getExam(tx, scope, examId, true);
  const assessments = (await listAssessments(tx, scope, examId)).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const sheets = await Promise.all(
    assessments.map(async (a) => ({
      ...a,
      marks: await tx
        .select()
        .from(examMarks)
        .where(
          and(whereScope(examMarks, scope), eq(examMarks.assessmentId, a.id)),
        )
        .orderBy(asc(examMarks.id)),
      corrections: await tx
        .select()
        .from(examCorrections)
        .where(
          and(
            whereScope(examCorrections, scope),
            eq(examCorrections.assessmentId, a.id),
            eq(examCorrections.status, 'pending'),
          ),
        ),
    })),
  );
  return {
    exam,
    assessments: sheets,
    ready:
      exam.status === 'completed' &&
      sheets.length > 0 &&
      sheets.every(
        (a) =>
          a.status === 'locked' &&
          !a.corrections.length &&
          a.marks.every((m) => m.status !== 'unmarked'),
      ),
  };
}
