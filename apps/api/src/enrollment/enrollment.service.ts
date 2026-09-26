import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  completeAcademicEnrollment,
  createAcademicEnrollment,
  createSchoolEnrollment,
  transferAcademicEnrollment,
  withdrawAcademicEnrollment,
  type AcademicEnrollmentInput,
  type EnrollmentCloseInput,
  type EnrollmentPlacementInput,
  type SchoolEnrollmentInput,
  type TenantTransaction,
} from '@classloom/db';
import { AcademicsService } from '../academics/academics.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { StudentPeopleService, type StudentPeopleActor } from '../people/student-people.service.js';

export interface EnrollmentPersistence {
  createSchool: typeof createSchoolEnrollment;
  createAcademic: typeof createAcademicEnrollment;
  transfer: typeof transferAcademicEnrollment;
  withdraw: typeof withdrawAcademicEnrollment;
  complete: typeof completeAcademicEnrollment;
}

const defaultPersistence: EnrollmentPersistence = {
  createSchool: createSchoolEnrollment,
  createAcademic: createAcademicEnrollment,
  transfer: transferAcademicEnrollment,
  withdraw: withdrawAcademicEnrollment,
  complete: completeAcademicEnrollment,
};

@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(StudentPeopleService) readonly people: StudentPeopleService,
    @Inject(AcademicsService) private readonly academics: AcademicsService,
    @Optional() private readonly persistence: EnrollmentPersistence = defaultPersistence,
  ) {}

  private async require(actor: StudentPeopleActor, schoolId: string, permission: 'enrollment.read' | 'enrollment.manage', message: string) {
    if (!await this.authorization.hasPermissions(actor, [permission], { kind: 'school', schoolId })) {
      throw new ForbiddenException(message);
    }
  }

  requireRead(actor: StudentPeopleActor, schoolId: string) {
    return this.require(actor, schoolId, 'enrollment.read', 'Enrollment access is not allowed for this school');
  }

  requireManage(actor: StudentPeopleActor, schoolId: string) {
    return this.require(actor, schoolId, 'enrollment.manage', 'Enrollment changes are not allowed for this school');
  }

  async createSchoolEnrollment(tx: TenantTransaction, actor: StudentPeopleActor, schoolId: string, studentId: string, input: SchoolEnrollmentInput) {
    await this.requireManage(actor, schoolId);
    return this.persistence.createSchool(tx, { tenantId: actor.tenantId, schoolId }, studentId, input, {
      actorAccountId: actor.accountId, requestId: actor.requestId,
    });
  }

  async createAcademicEnrollment(
    tx: TenantTransaction,
    actor: StudentPeopleActor,
    schoolId: string,
    schoolEnrollmentId: string,
    input: EnrollmentPlacementInput & AcademicEnrollmentInput,
  ) {
    await this.requireManage(actor, schoolId);
    const { sessionId, classId, sectionId, ...values } = input;
    const placement = await this.academics.requireEnrollmentPlacement(tx, { tenantId: actor.tenantId, schoolId }, { sessionId, classId, sectionId });
    return this.persistence.createAcademic(tx, { tenantId: actor.tenantId, schoolId }, schoolEnrollmentId, placement, values, {
      actorAccountId: actor.accountId, requestId: actor.requestId,
    });
  }

  async transferAcademicEnrollment(
    tx: TenantTransaction,
    actor: StudentPeopleActor,
    schoolId: string,
    enrollmentId: string,
    input: EnrollmentPlacementInput & AcademicEnrollmentInput & { reason?: string | null },
  ) {
    await this.requireManage(actor, schoolId);
    const { sessionId, classId, sectionId, ...values } = input;
    const placement = await this.academics.requireEnrollmentPlacement(tx, { tenantId: actor.tenantId, schoolId }, { sessionId, classId, sectionId });
    return this.persistence.transfer(tx, { tenantId: actor.tenantId, schoolId }, enrollmentId, placement, values, {
      actorAccountId: actor.accountId, requestId: actor.requestId,
    });
  }

  async withdrawAcademicEnrollment(tx: TenantTransaction, actor: StudentPeopleActor, schoolId: string, enrollmentId: string, input: EnrollmentCloseInput) {
    await this.requireManage(actor, schoolId);
    return this.persistence.withdraw(tx, { tenantId: actor.tenantId, schoolId }, enrollmentId, input, {
      actorAccountId: actor.accountId, requestId: actor.requestId,
    });
  }

  async completeAcademicEnrollment(tx: TenantTransaction, actor: StudentPeopleActor, schoolId: string, enrollmentId: string, input: EnrollmentCloseInput) {
    await this.requireManage(actor, schoolId);
    return this.persistence.complete(tx, { tenantId: actor.tenantId, schoolId }, enrollmentId, input, {
      actorAccountId: actor.accountId, requestId: actor.requestId,
    });
  }
}
