import { ConflictException, ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  AdmissionError,
  createAdmissionCase,
  getAdmissionCase,
  listAdmissionCaseEvents,
  listAdmissionCases,
  listStaffSchools,
  recordAdmissionConversion,
  transitionAdmissionCase,
  updateAdmissionCase,
  type AdmissionActor,
  type AdmissionCaseInput,
  type AdmissionConversionReferences,
  type AdmissionListFilters,
  type AdmissionScope,
  type AdmissionTransitionAction,
  type GuardianRelationshipInput,
  type TenantTransaction,
} from '@classloom/db';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { EnrollmentService, type AdmissionsEnrollmentInput } from '../enrollment/enrollment.service.js';

export type AdmissionsConversionRequest = {
  existingStudentId?: string;
  studentCode?: string;
  schoolEnrollment: { admissionNumber: string; admissionDate: string };
  academicEnrollment: { sessionId: string; classId: string; sectionId: string; rollNumber?: string | null; startDate: string };
  guardianCodes?: string[];
};

export type AdmissionsActor = AdmissionActor & { tenantId: string };

export interface AdmissionsPersistence {
  create: typeof createAdmissionCase;
  get: typeof getAdmissionCase;
  list: typeof listAdmissionCases;
  update: typeof updateAdmissionCase;
  transition: typeof transitionAdmissionCase;
  events: typeof listAdmissionCaseEvents;
  convert: typeof recordAdmissionConversion;
}
export const ADMISSIONS_PERSISTENCE = Symbol('ADMISSIONS_PERSISTENCE');

const defaultPersistence: AdmissionsPersistence = {
  create: createAdmissionCase,
  get: getAdmissionCase,
  list: listAdmissionCases,
  update: updateAdmissionCase,
  transition: transitionAdmissionCase,
  events: listAdmissionCaseEvents,
  convert: recordAdmissionConversion,
};

@Injectable()
export class AdmissionsService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Optional() @Inject(ADMISSIONS_PERSISTENCE) private readonly persistence: AdmissionsPersistence = defaultPersistence,
    @Inject(EnrollmentService) private readonly enrollment: EnrollmentService,
  ) {}

  private scope(actor: AdmissionsActor, schoolId: string): AdmissionScope {
    return { tenantId: actor.tenantId!, schoolId };
  }

  private async require(actor: AdmissionsActor, schoolId: string, permission: 'admissions.read' | 'admissions.manage' | 'admissions.convert') {
    if (!await this.authorization.hasPermissions(actor, [permission], { kind: 'school', schoolId })) {
      const labels = { 'admissions.read': 'Admissions access', 'admissions.manage': 'Admissions changes', 'admissions.convert': 'Admissions conversion' };
      throw new ForbiddenException(`${labels[permission]} are not allowed for this school`);
    }
  }

  async listSchools(tx: TenantTransaction, actor: AdmissionsActor) {
    const schools = await listStaffSchools(tx, actor.tenantId!);
    const capabilities = await Promise.all(schools.map(async (school) => {
      const [canReadAdmissions, canManageAdmissions, canConvertAdmissions] = await Promise.all([
        this.authorization.hasPermissions(actor, ['admissions.read'], { kind: 'school', schoolId: school.id }),
        this.authorization.hasPermissions(actor, ['admissions.manage'], { kind: 'school', schoolId: school.id }),
        this.authorization.hasPermissions(actor, ['admissions.convert'], { kind: 'school', schoolId: school.id }),
      ]);
      return { ...school, canReadAdmissions, canManageAdmissions, canConvertAdmissions };
    }));
    return capabilities.filter((school) => school.canReadAdmissions || school.canManageAdmissions || school.canConvertAdmissions);
  }

  async list(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, filters: AdmissionListFilters) {
    await this.require(actor, schoolId, 'admissions.read');
    return this.persistence.list(tx, this.scope(actor, schoolId), filters);
  }

  async get(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, caseId: string) {
    await this.require(actor, schoolId, 'admissions.read');
    return this.persistence.get(tx, this.scope(actor, schoolId), caseId);
  }

  async create(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, input: AdmissionCaseInput) {
    await this.require(actor, schoolId, 'admissions.manage');
    return this.persistence.create(tx, this.scope(actor, schoolId), input, actor);
  }

  async update(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, caseId: string, input: Partial<AdmissionCaseInput>) {
    await this.require(actor, schoolId, 'admissions.manage');
    return this.persistence.update(tx, this.scope(actor, schoolId), caseId, input, actor);
  }

  async transition(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, caseId: string, action: Exclude<AdmissionTransitionAction, 'admit'>, note?: string | null) {
    await this.require(actor, schoolId, 'admissions.manage');
    return this.persistence.transition(tx, this.scope(actor, schoolId), caseId, action, actor, note);
  }

  async events(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, caseId: string) {
    await this.require(actor, schoolId, 'admissions.read');
    return this.persistence.events(tx, this.scope(actor, schoolId), caseId);
  }

  async admit(tx: TenantTransaction, actor: AdmissionsActor, schoolId: string, caseId: string, input: AdmissionsConversionRequest) {
    await this.require(actor, schoolId, 'admissions.convert');
    const scope = this.scope(actor, schoolId);
    const admissionCase = await this.persistence.get(tx, scope, caseId);
    if (admissionCase.status !== 'accepted') throw new AdmissionError('CONFLICT', 'Only accepted applications can be admitted');
    const existingStudentId = input.existingStudentId ?? admissionCase.existingStudentId ?? undefined;
    let enrollmentInput: AdmissionsEnrollmentInput;
    if (existingStudentId) {
      enrollmentInput = { existingStudentId, schoolEnrollment: input.schoolEnrollment, academicEnrollment: input.academicEnrollment };
    } else {
      if (!input.studentCode?.trim()) throw new AdmissionError('INVALID', 'Student code is required to create a student profile');
      if (!admissionCase.studentGivenName || !admissionCase.studentFamilyName || !admissionCase.studentDateOfBirth) {
        throw new AdmissionError('INVALID', 'Complete the student name and date of birth before admission');
      }
      enrollmentInput = {
        student: {
          studentCode: input.studentCode, givenName: admissionCase.studentGivenName, middleName: admissionCase.studentMiddleName,
          familyName: admissionCase.studentFamilyName, preferredName: admissionCase.studentPreferredName,
          dateOfBirth: admissionCase.studentDateOfBirth, gender: admissionCase.studentGender, email: admissionCase.studentEmail, phone: admissionCase.studentPhone,
        },
        schoolEnrollment: input.schoolEnrollment, academicEnrollment: input.academicEnrollment,
      };
    }
    const guardians = admissionCase.guardians ?? [];
    if (input.guardianCodes && input.guardianCodes.length !== guardians.filter((guardian) => !guardian.guardianProfileId).length) {
      throw new AdmissionError('INVALID', 'Provide one guardian code for each new guardian');
    }
    let codeIndex = 0;
    enrollmentInput.guardians = guardians.map((guardian) => {
      const relationship: GuardianRelationshipInput = {
        relationshipType: guardian.relationshipType as GuardianRelationshipInput['relationshipType'],
        primaryContact: guardian.primaryContact,
        emergencyContact: guardian.emergencyContact,
        authorizedPickup: guardian.authorizedPickup,
        financialResponsibility: guardian.financialResponsibility,
        portalAccess: guardian.portalAccess,
      };
      if (guardian.guardianProfileId) return { guardianProfileId: guardian.guardianProfileId, relationship };
      const guardianCode = input.guardianCodes?.[codeIndex++];
      if (!guardianCode) throw new AdmissionError('INVALID', 'Guardian code is required for each new guardian');
      return {
        guardian: {
          guardianCode, givenName: guardian.givenName, middleName: guardian.middleName, familyName: guardian.familyName,
          preferredName: guardian.preferredName, email: guardian.email, phone: guardian.phone, occupation: guardian.occupation,
          addressLine1: guardian.addressLine1, addressLine2: guardian.addressLine2, city: guardian.city, state: guardian.state,
          postalCode: guardian.postalCode, countryCode: guardian.countryCode,
        }, relationship,
      };
    });
    const converted = await this.enrollment.admitStudentFromAdmissions(tx, actor, schoolId, enrollmentInput);
    const references: AdmissionConversionReferences = {
      studentId: converted.student.id,
      schoolEnrollmentId: converted.schoolEnrollment.id,
      academicEnrollmentId: converted.academicEnrollment.id,
    };
    try {
      return await this.persistence.convert(tx, scope, caseId, references, actor);
    } catch (error) {
      // A concurrent request may have completed conversion after this transaction first read the case.
      if (error instanceof AdmissionError && error.code === 'CONFLICT') throw new ConflictException(error.message);
      throw error;
    }
  }
}
