import { BadRequestException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  completeAcademicEnrollment,
  createAcademicEnrollment,
  createSchoolEnrollment,
  transferAcademicEnrollment,
  withdrawAcademicEnrollment,
  type AcademicEnrollmentInput,
  type EnrollmentCloseInput,
  type EnrollmentPlacementInput,
  type GuardianProfileInput,
  type GuardianRelationshipInput,
  type SchoolEnrollmentInput,
  type StudentProfileInput,
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

export type StudentAdmissionInput = {
  student: StudentProfileInput;
  schoolEnrollment: SchoolEnrollmentInput;
  academicEnrollment: EnrollmentPlacementInput & AcademicEnrollmentInput;
  guardians?: { guardian: GuardianProfileInput; relationship: GuardianRelationshipInput }[];
};

export type AdmissionsEnrollmentInput = {
  student?: StudentProfileInput;
  existingStudentId?: string | null;
  schoolEnrollment: SchoolEnrollmentInput;
  academicEnrollment: EnrollmentPlacementInput & AcademicEnrollmentInput;
  guardians?: { guardian?: GuardianProfileInput; guardianProfileId?: string | null; relationship: GuardianRelationshipInput }[];
};

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

  async admitStudent(tx: TenantTransaction, actor: StudentPeopleActor, schoolId: string, input: StudentAdmissionInput) {
    await Promise.all([
      this.people.requireStudentManage(actor, schoolId), this.requireManage(actor, schoolId),
      ...(input.guardians?.length ? [this.people.requireGuardianManage(actor, schoolId)] : []),
    ]);
    const audit = { actorAccountId: actor.accountId, requestId: actor.requestId };
    const student = await this.people.createOrResolveStudent(tx, actor.tenantId, input.student, audit);
    const schoolEnrollment = await this.createSchoolEnrollment(tx, actor, schoolId, student.id, input.schoolEnrollment);
    const academicEnrollment = await this.createAcademicEnrollment(tx, actor, schoolId, schoolEnrollment.id, input.academicEnrollment);
    const guardians = [];
    for (const entry of input.guardians ?? []) {
      const guardian = await this.people.createOrResolveGuardian(tx, actor.tenantId, entry.guardian, audit);
      const relationship = await this.people.createOrResolveRelationship(tx, actor.tenantId, student.id, guardian.id, entry.relationship, audit);
      guardians.push({ guardian, relationship });
    }
    return { student, schoolEnrollment, academicEnrollment, guardians };
  }

  /** Narrow conversion contract for Admissions; callers must already hold the case lock in this transaction. */
  async admitStudentFromAdmissions(tx: TenantTransaction, actor: StudentPeopleActor, schoolId: string, input: AdmissionsEnrollmentInput) {
    if (!await this.authorization.hasPermissions(actor, ['admissions.convert'], { kind: 'school', schoolId })) {
      throw new ForbiddenException('Admissions conversion is not allowed for this school');
    }
    if (Boolean(input.existingStudentId) === Boolean(input.student)) throw new BadRequestException('Choose either an existing student or new student details');
    const audit = { actorAccountId: actor.accountId, requestId: actor.requestId };
    const student = input.existingStudentId
      ? await this.people.getStudentById(tx, actor.tenantId, input.existingStudentId)
      : await this.people.createOrResolveStudent(tx, actor.tenantId, input.student!, audit);
    const schoolEnrollment = await this.persistence.createSchool(tx, { tenantId: actor.tenantId, schoolId }, student.id, input.schoolEnrollment, audit);
    const { sessionId, classId, sectionId, ...academicValues } = input.academicEnrollment;
    const placement = await this.academics.requireEnrollmentPlacement(tx, { tenantId: actor.tenantId, schoolId }, { sessionId, classId, sectionId });
    const academicEnrollment = await this.persistence.createAcademic(tx, { tenantId: actor.tenantId, schoolId }, schoolEnrollment.id, placement, academicValues, audit);
    const guardians = [];
    for (const entry of input.guardians ?? []) {
      if (Boolean(entry.guardianProfileId) === Boolean(entry.guardian)) throw new BadRequestException('Choose either an existing guardian or new guardian details');
      const guardian = entry.guardianProfileId
        ? await this.people.getGuardianById(tx, actor.tenantId, entry.guardianProfileId)
        : await this.people.createOrResolveGuardian(tx, actor.tenantId, entry.guardian!, audit);
      const relationship = await this.people.createOrResolveRelationship(tx, actor.tenantId, student.id, guardian.id, entry.relationship, audit);
      guardians.push({ guardian, relationship });
    }
    return { student, schoolEnrollment, academicEnrollment, guardians };
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
