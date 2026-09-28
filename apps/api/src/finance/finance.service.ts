import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  assignFeePlan, createFeeHead, createFeePlan, createFeePlanLine, findPaymentByKey,
  getFeePlan, getFinanceSchool, grantFeeConcession, listFeeOutstanding, listFeeSetup,
  listFinanceSchools, readFeeReceipt, readFeeStatement, recordFeePayment, reverseFeePayment,
  withTenantContext, type FinanceScope, type PaymentAllocation, type TenantTransaction,
} from '@classloom/db';
import { AcademicsService } from '../academics/academics.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { DatabaseService } from '../database/database.service.js';
import { EnrollmentService } from '../enrollment/enrollment.service.js';

export type FinanceUserActor = { tenantId: string; accountId: string; membershipId: string };
type FinancePermission = 'finance.read' | 'finance.manage' | 'payments.record' | 'payments.adjust';

@Injectable()
export class FinanceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(EnrollmentService) private readonly enrollment: EnrollmentService,
    @Inject(AcademicsService) private readonly academics: AcademicsService,
  ) {}

  private async allowed(actor: FinanceUserActor, schoolId: string, key: FinancePermission) {
    return this.authorization.hasPermissions(actor, [key], { kind: 'school', schoolId });
  }

  private async require(actor: FinanceUserActor, schoolId: string, key: FinancePermission) {
    if (!await this.allowed(actor, schoolId, key)) throw new ForbiddenException('Finance access is not allowed for this school');
  }

  private run<T>(actor: FinanceUserActor, work: (tx: TenantTransaction) => Promise<T>) {
    return withTenantContext(this.database.db, actor.tenantId, work);
  }

  async schools(actor: FinanceUserActor) {
    return this.run(actor, async (tx) => {
      const schools = await listFinanceSchools(tx, actor.tenantId);
      const rows = await Promise.all(schools.map(async (school) => ({ ...school,
        canRead: await this.allowed(actor, school.id, 'finance.read'),
        canManage: await this.allowed(actor, school.id, 'finance.manage'),
        canRecord: await this.allowed(actor, school.id, 'payments.record'),
        canAdjust: await this.allowed(actor, school.id, 'payments.adjust'),
      })));
      return rows.filter((school) => school.canRead);
    });
  }

  async setup(actor: FinanceUserActor, scope: FinanceScope) {
    await this.require(actor, scope.schoolId, 'finance.read');
    return this.run(actor, async (tx) => {
      await getFinanceSchool(tx, scope);
      const [fees, academic] = await Promise.all([listFeeSetup(tx, scope), this.academics.listFinanceOptions(tx, scope)]);
      return { ...fees, academic };
    });
  }

  async enrollments(actor: FinanceUserActor, scope: FinanceScope) {
    await this.require(actor, scope.schoolId, 'finance.read');
    return this.run(actor, async (tx) => { await getFinanceSchool(tx, scope); return this.enrollment.listFinanceEnrollments(tx, scope); });
  }

  async head(actor: FinanceUserActor, scope: FinanceScope, input: { code: string; name: string }) {
    await this.require(actor, scope.schoolId, 'finance.manage');
    return this.run(actor, async (tx) => { await getFinanceSchool(tx, scope); return createFeeHead(tx, scope, input); });
  }

  async plan(actor: FinanceUserActor, scope: FinanceScope, input: { sessionId: string; classId: string; name: string }) {
    await this.require(actor, scope.schoolId, 'finance.manage');
    return this.run(actor, async (tx) => {
      await getFinanceSchool(tx, scope);
      await this.academics.requireFinancePlanClass(tx, scope, input.sessionId, input.classId);
      return createFeePlan(tx, scope, input);
    });
  }

  async line(actor: FinanceUserActor, scope: FinanceScope, planId: string, input: { headId: string; label: string; dueDate: string; amountMinor: string }) {
    await this.require(actor, scope.schoolId, 'finance.manage');
    return this.run(actor, async (tx) => {
      const plan = await getFeePlan(tx, scope, planId);
      const context = await this.academics.requireFinancePlanClass(tx, scope, plan.sessionId, plan.classId);
      if (input.dueDate < context.session.startDate || input.dueDate > context.session.endDate) {
        throw new BadRequestException('Due date must be inside the academic session');
      }
      return createFeePlanLine(tx, scope, planId, input);
    });
  }

  async assign(actor: FinanceUserActor, scope: FinanceScope, planId: string, schoolEnrollmentId: string) {
    await this.require(actor, scope.schoolId, 'finance.manage');
    return this.run(actor, async (tx) => {
      const school = await getFinanceSchool(tx, scope);
      const enrollment = await this.enrollment.lockFinanceEnrollment(tx, scope, schoolEnrollmentId);
      if (enrollment.status !== 'active') throw new BadRequestException('Only an active student enrollment can receive new charges');
      const plan = await getFeePlan(tx, scope, planId);
      if (!await this.enrollment.hasFinancePlacement(tx, scope, schoolEnrollmentId, plan.sessionId, plan.classId)) {
        throw new BadRequestException('Student has no placement in the class and session of this plan');
      }
      return assignFeePlan(tx, scope, planId, schoolEnrollmentId, school.currency, actor);
    });
  }

  async statement(actor: FinanceUserActor, scope: FinanceScope, schoolEnrollmentId: string) {
    await this.require(actor, scope.schoolId, 'finance.read');
    return this.run(actor, async (tx) => {
      await this.enrollment.lockFinanceEnrollment(tx, scope, schoolEnrollmentId);
      return readFeeStatement(tx, scope, schoolEnrollmentId);
    });
  }

  async outstanding(actor: FinanceUserActor, scope: FinanceScope) {
    await this.require(actor, scope.schoolId, 'finance.read');
    return this.run(actor, async (tx) => { await getFinanceSchool(tx, scope); return listFeeOutstanding(tx, scope); });
  }

  async concession(actor: FinanceUserActor, scope: FinanceScope, schoolEnrollmentId: string, chargeId: string, amountMinor: string, reason: string) {
    await this.require(actor, scope.schoolId, 'payments.adjust');
    return this.run(actor, async (tx) => {
      await this.enrollment.lockFinanceEnrollment(tx, scope, schoolEnrollmentId);
      return grantFeeConcession(tx, scope, schoolEnrollmentId, chargeId, amountMinor, reason, actor);
    });
  }

  async payment(actor: FinanceUserActor, scope: FinanceScope, input: {
    schoolEnrollmentId: string; idempotencyKey: string; method: string; reference?: string | null; allocations: PaymentAllocation[];
  }) {
    await this.require(actor, scope.schoolId, 'payments.record');
    return this.run(actor, async (tx) => {
      await this.enrollment.lockFinanceEnrollment(tx, scope, input.schoolEnrollmentId);
      const prior = await findPaymentByKey(tx, scope, input.idempotencyKey);
      if (prior && prior.schoolEnrollmentId !== input.schoolEnrollmentId) throw new ConflictException('Payment key was already used for another student');
      return recordFeePayment(tx, scope, input, actor);
    });
  }

  async receipt(actor: FinanceUserActor, scope: FinanceScope, paymentId: string) {
    await this.require(actor, scope.schoolId, 'finance.read');
    return this.run(actor, async (tx) => readFeeReceipt(tx, scope, paymentId));
  }

  async reverse(actor: FinanceUserActor, scope: FinanceScope, paymentId: string, reason: string) {
    await this.require(actor, scope.schoolId, 'payments.adjust');
    return this.run(actor, async (tx) => {
      const receipt = await readFeeReceipt(tx, scope, paymentId);
      await this.enrollment.lockFinanceEnrollment(tx, scope, receipt.schoolEnrollmentId);
      return reverseFeePayment(tx, scope, paymentId, reason, actor);
    });
  }
}
