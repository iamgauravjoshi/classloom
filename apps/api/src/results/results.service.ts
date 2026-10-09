import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  withTenantContext,
  ResultsError,
  resultConflict,
  resultVersion,
  listResultPolicies,
  getResultPolicy,
  createResultPolicy,
  listResultBatches,
  getResultBatch,
  listBatchReports,
  listResultHistory,
  createResultBatch,
  updateResultBatch,
  recalculateResultReports,
  findResultReport,
  saveResultRemarks,
  listPersonalReports,
  resultEvent,
  type TenantTransaction,
  type PermissionKey,
  type GradingPolicyInput,
  type ResultCalculationSource,
} from '@classloom/db';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AcademicsService } from '../academics/academics.service.js';
import { EnrollmentService } from '../enrollment/enrollment.service.js';
import { StudentPeopleService } from '../people/student-people.service.js';
import {
  ExaminationsService,
  type ExaminationActor,
} from '../examinations/examinations.service.js';
import {
  calculateReports,
  validateGradingPolicy,
} from './result-calculator.js';
export type ResultsActor = ExaminationActor;
export type ResultsAction =
  'submit' | 'return' | 'approve' | 'publish' | 'withdraw';
@Injectable()
export class ResultsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(AcademicsService) private readonly academics: AcademicsService,
    @Inject(EnrollmentService) private readonly enrollment: EnrollmentService,
    @Inject(StudentPeopleService) private readonly people: StudentPeopleService,
    @Inject(ExaminationsService) private readonly exams: ExaminationsService,
  ) {}
  private allowed(actor: ResultsActor, schoolId: string, key: PermissionKey) {
    return this.authorization.hasPermissions(actor, [key], {
      kind: 'school',
      schoolId,
    });
  }
  async capabilities(actor: ResultsActor, schoolId: string) {
    const [canRead, canManage, canApprove, canPublish, canExport] =
      await Promise.all(
        (
          [
            'results.read',
            'results.manage',
            'results.approve',
            'results.publish',
            'results.export',
          ] as const
        ).map((k) => this.allowed(actor, schoolId, k)),
      );
    return { canRead, canManage, canApprove, canPublish, canExport };
  }
  private async require(
    actor: ResultsActor,
    schoolId: string,
    key: PermissionKey,
  ) {
    if (!(await this.allowed(actor, schoolId, key)))
      throw new ForbiddenException(
        'Your role does not allow this results action at this school',
      );
  }
  private async readAccess(actor: ResultsActor, schoolId: string) {
    const c = await this.capabilities(actor, schoolId);
    if (!Object.values(c).some(Boolean))
      throw new ForbiddenException(
        'Results access is not allowed at this school',
      );
    return c;
  }
  async access(actor: ResultsActor) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => ({
      schools: (
        await Promise.all(
          (await this.academics.resultSchools(tx, actor.tenantId)).map(
            async (s) => ({
              ...s,
              ...(await this.capabilities(actor, s.id)),
            }),
          ),
        )
      ).filter(
        (s) =>
          s.canRead ||
          s.canManage ||
          s.canApprove ||
          s.canPublish ||
          s.canExport,
      ),
      canReadOwn:
        (await this.people.reportAccess(tx, actor.tenantId, actor.membershipId))
          .length > 0,
    }));
  }
  async setup(actor: ResultsActor, schoolId: string) {
    const capabilities = await this.readAccess(actor, schoolId);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId };
      return {
        capabilities,
        exams: (await this.exams.resultExams(tx, scope)).filter(
          (e) => e.status === 'completed',
        ),
        policies: await listResultPolicies(tx, scope),
        batches: await listResultBatches(tx, scope),
      };
    });
  }
  async policy(
    actor: ResultsActor,
    schoolId: string,
    input: GradingPolicyInput,
  ) {
    await this.require(actor, schoolId, 'results.manage');
    return withTenantContext(this.database.db, actor.tenantId, (tx) =>
      createResultPolicy(
        tx,
        { tenantId: actor.tenantId, schoolId },
        validateGradingPolicy(input),
        actor,
      ),
    );
  }
  private async source(
    tx: TenantTransaction,
    actor: ResultsActor,
    schoolId: string,
    examId: string,
    calculate = false,
  ) {
    const scope = { tenantId: actor.tenantId, schoolId },
      source = await this.exams.resultSource(tx, scope, examId);
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          exam: source.exam.version,
          assessments: source.assessments.map((a) => ({
            id: a.id,
            version: a.version,
            marks: a.marks.map((m) => ({
              id: m.id,
              revision: m.revision,
              status: m.status,
              score: m.score,
            })),
          })),
        }),
      )
      .digest('hex');
    if (calculate && !source.ready)
      resultConflict(
        'Complete the examination, lock every assessment, and resolve pending mark corrections before calculating or reviewing results',
      );
    return { ...source, fingerprint };
  }
  private async calculate(
    tx: TenantTransaction,
    actor: ResultsActor,
    schoolId: string,
    examId: string,
    policyId: string,
  ) {
    const scope = { tenantId: actor.tenantId, schoolId },
      source = await this.source(tx, actor, schoolId, examId, true),
      policy = await getResultPolicy(tx, scope, policyId);
    const options = await this.academics.listExaminationOptions(tx, scope),
      school = (await this.academics.resultSchools(tx, actor.tenantId)).find(
        (s) => s.id === schoolId,
      );
    const roster = await this.enrollment.resolveResultRoster(tx, scope, [
      ...new Set(
        source.assessments.flatMap((a) =>
          a.marks.map((m) => m.academicEnrollmentId),
        ),
      ),
    ]);
    const identities = await this.people.resultIdentities(tx, actor.tenantId, [
      ...new Set(roster.map((r) => r.studentId)),
    ]);
    const session = options.sessions.find(
        (s) => s.id === source.exam.sessionId,
      ),
      classItem = options.classes.find((c) => c.id === source.exam.classId);
    if (!school || !session || !classItem)
      throw new ResultsError('CONFLICT', 'Examination context is unavailable');
    const calculation: ResultCalculationSource = {
      school: {
        name: school.name,
        code: school.code,
        timezone: school.timezone,
      },
      exam: source.exam,
      sessionName: session.name,
      className: classItem.name,
      assessments: source.assessments.map((a) => {
        const section = options.sections.find((s) => s.id === a.sectionId),
          subject = options.subjects.find((s) => s.id === a.subjectId);
        if (!section || !subject)
          resultConflict('An examination section or subject is unavailable');
        return {
          ...a,
          sectionName: section.name,
          subjectName: subject.name,
          marks: a.marks.map((m) => {
            const r = roster.find(
                (r) => r.academicEnrollmentId === m.academicEnrollmentId,
              ),
              i = r && identities.find((i) => i.id === r.studentId);
            if (!r || !i || m.status === 'unmarked')
              resultConflict(
                'A reviewed examination roster identity is unavailable',
              );
            return {
              studentId: r.studentId,
              schoolEnrollmentId: r.schoolEnrollmentId,
              status: m.status as 'scored' | 'absent' | 'exempt',
              score: m.score,
              identity: {
                id: i.id,
                code: i.code,
                name: m.displayName,
                dateOfBirth: i.dateOfBirth,
                admissionNumber: r.admissionNumber,
                rollNumber: m.rollNumber,
              },
            };
          }),
        };
      }),
    };
    return { source, policy, reports: calculateReports(calculation, policy) };
  }
  async generate(
    actor: ResultsActor,
    schoolId: string,
    input: { examId: string; gradingPolicyId: string; idempotencyKey: string },
  ) {
    await this.require(actor, schoolId, 'results.manage');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId };
      await this.source(tx, actor, schoolId, input.examId);
      const existing = (await listResultBatches(tx, scope)).find(
        (b) => b.idempotencyKey === input.idempotencyKey,
      );
      const requestChecksum = createHash('sha256')
        .update(
          JSON.stringify({
            examId: input.examId,
            gradingPolicyId: input.gradingPolicyId,
            accountId: actor.accountId,
            membershipId: actor.membershipId,
          }),
        )
        .digest('hex');
      if (existing) {
        if (existing.requestChecksum !== requestChecksum)
          resultConflict(
            'This request key was already used for another result edition',
          );
        return existing;
      }
      const { source, reports } = await this.calculate(
        tx,
        actor,
        schoolId,
        input.examId,
        input.gradingPolicyId,
      );
      return createResultBatch(
        tx,
        scope,
        {
          ...input,
          requestChecksum,
          sessionId: source.exam.sessionId,
          classId: source.exam.classId,
          sourceFingerprint: source.fingerprint,
        },
        reports,
        actor,
      );
    });
  }
  async batch(actor: ResultsActor, schoolId: string, id: string) {
    const capabilities = await this.readAccess(actor, schoolId);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId },
        initial = await getResultBatch(tx, scope, id),
        source = await this.source(tx, actor, schoolId, initial.examId),
        batch = await getResultBatch(tx, scope, id, 'share');
      return {
        batch,
        reports: await listBatchReports(tx, scope, id),
        events: await listResultHistory(tx, scope, id),
        sourceCurrent:
          source.ready && source.fingerprint === batch.sourceFingerprint,
        capabilities,
        currentAccountId: actor.accountId,
      };
    });
  }
  async recalculate(
    actor: ResultsActor,
    schoolId: string,
    id: string,
    expectedVersion: number,
  ) {
    await this.require(actor, schoolId, 'results.manage');
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId },
        initial = await getResultBatch(tx, scope, id);
      const { source, reports } = await this.calculate(
        tx,
        actor,
        schoolId,
        initial.examId,
        initial.gradingPolicyId,
      );
      const batch = await getResultBatch(tx, scope, id, 'update');
      resultVersion(batch.version, expectedVersion);
      if (batch.status !== 'draft')
        resultConflict('Return this edition to draft before recalculating');
      await recalculateResultReports(tx, scope, id, reports);
      const row = await updateResultBatch(tx, scope, id, {
        sourceFingerprint: source.fingerprint,
        version: batch.version + 1,
        preparedByAccountId: actor.accountId,
        preparedByMembershipId: actor.membershipId,
      });
      await resultEvent(
        tx,
        scope,
        id,
        null,
        'results_recalculated',
        { sourceFingerprint: source.fingerprint },
        actor,
      );
      return row;
    });
  }
  async lifecycle(
    actor: ResultsActor,
    schoolId: string,
    id: string,
    expectedVersion: number,
    action: ResultsAction,
    note?: string,
  ) {
    await this.require(
      actor,
      schoolId,
      action === 'submit'
        ? 'results.manage'
        : action === 'approve' || action === 'return'
          ? 'results.approve'
          : 'results.publish',
    );
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const scope = { tenantId: actor.tenantId, schoolId },
        initial = await getResultBatch(tx, scope, id),
        source = await this.source(tx, actor, schoolId, initial.examId),
        batch = await getResultBatch(tx, scope, id, 'update');
      resultVersion(batch.version, expectedVersion);
      if (
        ['submit', 'approve', 'publish'].includes(action) &&
        (!source.ready || source.fingerprint !== batch.sourceFingerprint)
      )
        resultConflict(
          'Marks changed or a correction is pending. Return to draft and recalculate before review',
        );
      let values: Parameters<typeof updateResultBatch>[3] = {
        version: batch.version + 1,
      };
      if (action === 'submit') {
        if (batch.status !== 'draft')
          resultConflict('Only draft results can be submitted');
        const reports = await listBatchReports(tx, scope, id);
        if (
          !reports.length ||
          reports.some(
            (r) =>
              r.snapshot.overall.outcome === 'incomplete' && !r.remarks?.trim(),
          )
        )
          throw new ResultsError(
            'INVALID',
            'Add a staff remark to each incomplete report before submitting',
          );
        values = {
          ...values,
          status: 'submitted',
          submittedByAccountId: actor.accountId,
          submittedByMembershipId: actor.membershipId,
        };
      }
      if (action === 'return') {
        if (!['submitted', 'approved'].includes(batch.status))
          resultConflict('Only submitted or approved results can be returned');
        if (!note?.trim())
          throw new ResultsError(
            'INVALID',
            'Enter a reason for returning this edition',
          );
        values = {
          ...values,
          status: 'draft',
          submittedByAccountId: null,
          submittedByMembershipId: null,
          approvedByAccountId: null,
          approvedByMembershipId: null,
        };
      }
      if (action === 'approve') {
        if (batch.status !== 'submitted')
          resultConflict('Submit these results before approval');
        if (
          actor.accountId === batch.preparedByAccountId ||
          actor.accountId === batch.submittedByAccountId
        )
          throw new ForbiddenException(
            'A different staff account must approve these results',
          );
        values = {
          ...values,
          status: 'approved',
          approvedByAccountId: actor.accountId,
          approvedByMembershipId: actor.membershipId,
        };
      }
      if (action === 'publish') {
        if (batch.status !== 'approved')
          resultConflict('Approve these results before publishing');
        const others = (await listResultBatches(tx, scope)).filter(
          (b) => b.examId === batch.examId,
        );
        if (others.some((b) => b.publishedAt && b.edition > batch.edition))
          resultConflict(
            'A newer edition was already published. Create a new edition instead',
          );
        for (const previous of others.filter((b) => b.status === 'published')) {
          await updateResultBatch(tx, scope, previous.id, {
            status: 'superseded',
            version: previous.version + 1,
          });
          await resultEvent(
            tx,
            scope,
            previous.id,
            null,
            'results_superseded',
            { replacedBy: id },
            actor,
          );
        }
        values = {
          ...values,
          status: 'published',
          publishedAt: new Date(),
          publishedByAccountId: actor.accountId,
          publishedByMembershipId: actor.membershipId,
        };
      }
      if (action === 'withdraw') {
        if (batch.status !== 'published')
          resultConflict('Only the published edition can be withdrawn');
        if (!note?.trim())
          throw new ResultsError(
            'INVALID',
            'Enter a reason for withdrawing this edition',
          );
        values = { ...values, status: 'withdrawn' };
      }
      const row = await updateResultBatch(tx, scope, id, values);
      await resultEvent(
        tx,
        scope,
        id,
        null,
        `results_${action}`,
        { reason: note?.trim() ?? null },
        actor,
      );
      return row;
    });
  }
  async personal(actor: ResultsActor) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) =>
      (
        await listPersonalReports(
          tx,
          actor.tenantId,
          await this.people.reportAccess(
            tx,
            actor.tenantId,
            actor.membershipId,
          ),
        )
      ).map(({ report, batch }) => ({
        report,
        batch: {
          id: batch.id,
          examId: batch.examId,
          edition: batch.edition,
          status: batch.status,
          publishedAt: batch.publishedAt,
        },
      })),
    );
  }
  async report(actor: ResultsActor, id: string, exportPdf = false) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const report = await findResultReport(tx, actor.tenantId, id),
        scope = { tenantId: actor.tenantId, schoolId: report.schoolId },
        batch = await getResultBatch(tx, scope, report.batchId, 'share'),
        capabilities = await this.capabilities(actor, report.schoolId);
      const staff = exportPdf
          ? capabilities.canExport
          : Object.values(capabilities).some(Boolean),
        own =
          batch.status === 'published' &&
          (
            await this.people.reportAccess(
              tx,
              actor.tenantId,
              actor.membershipId,
            )
          ).includes(report.studentId);
      if (!staff && !own)
        throw new ForbiddenException(
          'This report card is not available to your account',
        );
      if (exportPdf)
        await resultEvent(
          tx,
          scope,
          batch.id,
          null,
          'report_exported',
          { reportId: id, audience: staff ? 'staff' : 'family' },
          actor,
        );
      return {
        report: await findResultReport(tx, actor.tenantId, id),
        batch: staff
          ? batch
          : {
              id: batch.id,
              examId: batch.examId,
              edition: batch.edition,
              status: batch.status,
              publishedAt: batch.publishedAt,
            },
        capabilities: staff
          ? capabilities
          : {
              canRead: false,
              canManage: false,
              canApprove: false,
              canPublish: false,
              canExport: false,
            },
        canDownload: capabilities.canExport || own,
      };
    });
  }
  async remarks(
    actor: ResultsActor,
    id: string,
    expectedVersion: number,
    note: string | null,
  ) {
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const report = await findResultReport(tx, actor.tenantId, id),
        scope = { tenantId: actor.tenantId, schoolId: report.schoolId };
      await this.require(actor, report.schoolId, 'results.manage');
      const initial = await getResultBatch(tx, scope, report.batchId);
      await this.source(tx, actor, report.schoolId, initial.examId);
      const batch = await getResultBatch(tx, scope, report.batchId, 'update');
      resultVersion(batch.version, expectedVersion);
      if (batch.status !== 'draft')
        resultConflict('Remarks can only be changed in a draft edition');
      const remarks = note?.trim() || null;
      if (remarks && remarks.length > 1000)
        throw new ResultsError(
          'INVALID',
          'Remarks must be at most 1,000 characters',
        );
      await saveResultRemarks(tx, scope, id, remarks);
      await updateResultBatch(tx, scope, batch.id, {
        version: batch.version + 1,
        preparedByAccountId: actor.accountId,
        preparedByMembershipId: actor.membershipId,
      });
      await resultEvent(
        tx,
        scope,
        batch.id,
        null,
        'report_remarks_updated',
        { reportId: id },
        actor,
      );
      return { saved: true };
    });
  }
}
