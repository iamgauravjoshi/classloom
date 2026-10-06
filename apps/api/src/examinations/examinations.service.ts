import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  withTenantContext, listAttendanceSchools, getAttendanceSchool, ExaminationError,
  createExam, addAssessment, getExam, getAssessment, listExams, listAssessments, openExam, completeExam,
  readExamSheet, saveExamMarks, transitionExamSheet, requestExamCorrection, decideExamCorrection,
  readResultExamSource,
  type ExamActor, type MarkInput, type MarkValue, type PermissionKey, type TenantTransaction,
} from '@classloom/db';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AcademicsService } from '../academics/academics.service.js';
import { EnrollmentService } from '../enrollment/enrollment.service.js';
import { PeopleService } from '../people/people.service.js';
import { schoolLocalDate } from '../attendance/attendance.service.js';

export type ExaminationActor = ExamActor & { tenantId: string };
@Injectable()
export class ExaminationsService {
  resultSource(tx: TenantTransaction, scope: { tenantId: string; schoolId: string }, examId: string) { return readResultExamSource(tx, scope, examId); }
  resultExams(tx: TenantTransaction, scope: { tenantId: string; schoolId: string }) { return listExams(tx, scope); }
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(AcademicsService) private readonly academics: AcademicsService,
    @Inject(EnrollmentService) private readonly enrollment: EnrollmentService,
    @Inject(PeopleService) private readonly people: PeopleService,
  ) {}
  private allowed(actor: ExaminationActor, schoolId: string, key: PermissionKey) {
    return this.authorization.hasPermissions(actor, [key], { kind: 'school', schoolId });
  }
  async capabilities(actor: ExaminationActor, schoolId: string) {
    const [canRead, canManage, canEnter, canApprove] = await Promise.all(['marks.read', 'exams.manage', 'marks.enter', 'marks.approve'].map((key) => this.allowed(actor, schoolId, key as PermissionKey)));
    return { canRead, canManage, canEnter, canApprove };
  }
  private async require(actor: ExaminationActor, schoolId: string, key: PermissionKey) {
    if (!await this.allowed(actor, schoolId, key)) throw new ForbiddenException('Your role does not allow this examination action at this school');
  }
  private async context(tx: TenantTransaction, actor: ExaminationActor, schoolId: string) {
    const scope = { tenantId: actor.tenantId, schoolId };
    const school = await getAttendanceSchool(tx, scope);
    if (!school) throw new ExaminationError('NOT_FOUND', 'School was not found');
    const capabilities = await this.capabilities(actor, schoolId);
    if (!Object.values(capabilities).some(Boolean)) throw new ForbiddenException('Examination access is not allowed for this school');
    const options = await this.academics.listExaminationOptions(tx, scope);
    const link = await this.people.getAttendanceTeacherLink(tx, scope, actor.membershipId);
    return { scope, school, capabilities, options, link };
  }
  private canViewAssessment(context: Awaited<ReturnType<ExaminationsService['context']>>, actor: ExaminationActor, assessment: { sessionId: string; sectionId: string; subjectId: string }) {
    if (context.capabilities.canManage || context.capabilities.canApprove) return true;
    if (!context.link.linked) return context.capabilities.canRead && !context.capabilities.canEnter;
    return context.link.eligible && context.options.assignments.some((a) => a.membershipId === actor.membershipId && a.sessionId === assessment.sessionId && a.sectionId === assessment.sectionId && a.subjectId === assessment.subjectId);
  }
  private async assessmentContext(tx: TenantTransaction, actor: ExaminationActor, schoolId: string, assessmentId: string, entry = false) {
    const context = await this.context(tx, actor, schoolId);
    const assessment = await getAssessment(tx, context.scope, assessmentId);
    if (!this.canViewAssessment(context, actor, assessment)) throw new ForbiddenException('This assessment is outside your eligible teaching assignments');
    if (entry && !(context.capabilities.canManage || context.capabilities.canApprove) && (!context.link.linked || !context.link.eligible)) throw new ForbiddenException('Link an eligible teacher profile before entering marks');
    if (entry && assessment.assessmentDate > schoolLocalDate(new Date(), context.school.timezone)) throw new ExaminationError('INVALID', 'Marks entry starts on the scheduled assessment date');
    return { ...context, assessment };
  }
  async schools(actor: ExaminationActor) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const schools = await listAttendanceSchools(tx, actor.tenantId);
      const visible = await Promise.all(schools.map(async (s) => ({ ...s, ...await this.capabilities(actor, s.id) })));
      return visible.filter((s) => s.canRead || s.canManage || s.canEnter || s.canApprove);
    });
  }
  async setup(actor: ExaminationActor, schoolId: string) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const c = await this.context(tx, actor, schoolId);
      const { assignments: _assignments, ...academic } = c.options;
      const all = await listExams(tx, c.scope);
      const assessments = (await Promise.all(all.map((exam) => listAssessments(tx, c.scope, exam.id)))).flat().filter((a) => this.canViewAssessment(c, actor, a));
      return { academic, capabilities: c.capabilities, exams: all.filter((exam) => c.capabilities.canManage || c.capabilities.canApprove || assessments.some((a) => a.examId === exam.id)), assessments };
    });
  }
  async create(actor: ExaminationActor, schoolId: string, input: Parameters<typeof createExam>[2]) {
    await this.require(actor, schoolId, 'exams.manage');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId };
      const { session } = await this.academics.requireFinancePlanClass(tx, scope, input.sessionId, input.classId);
      if (input.startDate < session.startDate || input.endDate > session.endDate || input.endDate < input.startDate) throw new ExaminationError('INVALID', 'Examination dates must be ordered and within the academic session');
      return createExam(tx, scope, input, actor);
    });
  }
  async add(actor: ExaminationActor, schoolId: string, examId: string, input: Parameters<typeof addAssessment>[3]) {
    await this.require(actor, schoolId, 'exams.manage');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId }, exam = await getExam(tx, scope, examId, true);
      const options = await this.academics.listExaminationOptions(tx, scope);
      if (!options.sections.some((s) => s.id === input.sectionId && s.sessionId === exam.sessionId && s.classId === exam.classId) || !options.subjects.some((s) => s.id === input.subjectId && s.sessionId === exam.sessionId)) throw new ExaminationError('INVALID', 'Choose a section in the examination class and a subject in its session');
      return addAssessment(tx, scope, examId, input, actor);
    });
  }
  async lifecycle(actor: ExaminationActor, schoolId: string, examId: string, version: number, action: 'open' | 'complete') {
    await this.require(actor, schoolId, 'exams.manage');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId };
      if (action === 'complete') return completeExam(tx, scope, examId, version, actor);
      const exam = await getExam(tx, scope, examId, true), assessments = await listAssessments(tx, scope, examId);
      const rosters = new Map<string, Awaited<ReturnType<EnrollmentService['listExaminationRoster']>>>();
      for (const a of assessments) rosters.set(a.id, await this.enrollment.listExaminationRoster(tx, scope, exam.sessionId, a.sectionId, a.assessmentDate));
      return openExam(tx, scope, examId, version, rosters, actor);
    });
  }
  async sheet(actor: ExaminationActor, schoolId: string, assessmentId: string) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const c = await this.assessmentContext(tx, actor, schoolId, assessmentId);
      const sheet = await readExamSheet(tx, c.scope, assessmentId);
      return { ...sheet, capabilities: c.capabilities, currentAccountId: actor.accountId };
    });
  }
  async save(actor: ExaminationActor, schoolId: string, assessmentId: string, version: number, entries: MarkInput[]) {
    await this.require(actor, schoolId, 'marks.enter');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const c = await this.assessmentContext(tx, actor, schoolId, assessmentId, true);
      return saveExamMarks(tx, c.scope, assessmentId, version, entries, actor);
    });
  }
  async transition(actor: ExaminationActor, schoolId: string, assessmentId: string, version: number, action: 'submit' | 'return' | 'lock', note?: string) {
    await this.require(actor, schoolId, action === 'submit' ? 'marks.enter' : 'marks.approve');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const c = await this.assessmentContext(tx, actor, schoolId, assessmentId, action === 'submit');
      return transitionExamSheet(tx, c.scope, assessmentId, version, action, note, actor);
    });
  }
  async correction(actor: ExaminationActor, schoolId: string, assessmentId: string, version: number, markId: string, input: MarkValue & { reason: string }) {
    await this.require(actor, schoolId, 'marks.enter');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const c = await this.assessmentContext(tx, actor, schoolId, assessmentId, true);
      return requestExamCorrection(tx, c.scope, assessmentId, version, markId, input, actor);
    });
  }
  async decide(actor: ExaminationActor, schoolId: string, assessmentId: string, version: number, correctionId: string, decision: 'approve' | 'reject', note: string) {
    await this.require(actor, schoolId, 'marks.approve');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const c = await this.assessmentContext(tx, actor, schoolId, assessmentId);
      return decideExamCorrection(tx, c.scope, assessmentId, version, correctionId, decision, note, actor);
    });
  }
}
