import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  createGuardianProfile,
  createOrUpdateGuardianRelationship,
  createStudentProfile,
  findGuardianByCode,
  findStudentGuardianRelationship,
  findStudentByCode,
  readStudentProfile,
  readGuardianProfile,
  StudentPeopleError,
  reportAccessStudentIds,
  readResultStudentIdentities,
  type GuardianProfileInput,
  type GuardianRelationshipInput,
  type StudentPeopleAudit,
  type StudentProfileInput,
  type TenantTransaction,
} from '@classloom/db';
import { AuthorizationService } from '../authorization/authorization.service.js';

export type StudentPeopleActor = { tenantId: string; accountId: string; membershipId: string; requestId?: string };

export interface StudentPeoplePersistence {
  findStudent: typeof findStudentByCode;
  findGuardian: typeof findGuardianByCode;
  createStudent: typeof createStudentProfile;
  createGuardian: typeof createGuardianProfile;
  createRelationship: typeof createOrUpdateGuardianRelationship;
  findRelationship: typeof findStudentGuardianRelationship;
  readStudent: typeof readStudentProfile;
  readGuardian: typeof readGuardianProfile;
}

const defaultPersistence: StudentPeoplePersistence = {
  findStudent: findStudentByCode,
  findGuardian: findGuardianByCode,
  createStudent: createStudentProfile,
  createGuardian: createGuardianProfile,
  createRelationship: createOrUpdateGuardianRelationship,
  findRelationship: findStudentGuardianRelationship,
  readStudent: readStudentProfile,
  readGuardian: readGuardianProfile,
};

@Injectable()
export class StudentPeopleService {
  reportAccess(tx: TenantTransaction, tenantId: string, membershipId: string) { return reportAccessStudentIds(tx, tenantId, membershipId); }
  resultIdentities(tx: TenantTransaction, tenantId: string, ids: string[]) { return readResultStudentIdentities(tx, tenantId, ids); }
  constructor(@Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  private async require(actor: StudentPeopleActor, schoolId: string, permission: 'student.read' | 'student.manage' | 'guardian.read' | 'guardian.manage', message: string) {
    if (!await this.authorization.hasPermissions(actor, [permission], { kind: 'school', schoolId })) {
      throw new ForbiddenException(message);
    }
  }

  requireStudentRead(actor: StudentPeopleActor, schoolId: string) {
    return this.require(actor, schoolId, 'student.read', 'Student directory access is not allowed for this school');
  }

  requireStudentManage(actor: StudentPeopleActor, schoolId: string) {
    return this.require(actor, schoolId, 'student.manage', 'Student changes are not allowed for this school');
  }

  requireGuardianRead(actor: StudentPeopleActor, schoolId: string) {
    return this.require(actor, schoolId, 'guardian.read', 'Guardian directory access is not allowed for this school');
  }

  requireGuardianManage(actor: StudentPeopleActor, schoolId: string) {
    return this.require(actor, schoolId, 'guardian.manage', 'Guardian changes are not allowed for this school');
  }

  private async requireEverySchool(
    actor: StudentPeopleActor,
    schoolIds: string[],
    permission: 'student.manage' | 'guardian.manage',
    subject: string,
  ) {
    const uniqueSchoolIds = [...new Set(schoolIds)];
    if (!uniqueSchoolIds.length) {
      throw new ForbiddenException(`Managing shared ${subject} details requires an active school enrollment`);
    }
    const decisions = await Promise.all(uniqueSchoolIds.map((schoolId) =>
      this.authorization.hasPermissions(actor, [permission], { kind: 'school', schoolId })));
    if (!decisions.every(Boolean)) {
      throw new ForbiddenException(`Managing shared ${subject} details requires access to every active school`);
    }
  }

  requireSharedStudentManage(actor: StudentPeopleActor, activeSchoolIds: string[]) {
    return this.requireEverySchool(actor, activeSchoolIds, 'student.manage', 'student');
  }

  requireSharedGuardianManage(actor: StudentPeopleActor, activeSchoolIds: string[]) {
    return this.requireEverySchool(actor, activeSchoolIds, 'guardian.manage', 'guardian');
  }

  async createOrResolveStudent(
    tx: TenantTransaction,
    tenantId: string,
    input: StudentProfileInput,
    audit: StudentPeopleAudit,
    persistence: StudentPeoplePersistence = defaultPersistence,
  ) {
    const existing = await persistence.findStudent(tx, tenantId, input.studentCode);
    if (!existing) return persistence.createStudent(tx, tenantId, input, audit);
    const candidate = input.studentCode.trim().toUpperCase();
    if (existing.studentCode !== candidate || existing.givenName !== input.givenName.trim() || existing.familyName !== input.familyName.trim() || existing.dateOfBirth !== input.dateOfBirth) {
      throw new StudentPeopleError('CONFLICT', 'Student code belongs to a different student');
    }
    return existing;
  }

  async createOrResolveGuardian(
    tx: TenantTransaction,
    tenantId: string,
    input: GuardianProfileInput,
    audit: StudentPeopleAudit,
    persistence: StudentPeoplePersistence = defaultPersistence,
  ) {
    const existing = await persistence.findGuardian(tx, tenantId, input.guardianCode);
    if (!existing) return persistence.createGuardian(tx, tenantId, input, audit);
    const candidate = input.guardianCode.trim().toUpperCase();
    if (existing.guardianCode !== candidate || existing.givenName !== input.givenName.trim() || existing.familyName !== input.familyName.trim()) {
      throw new StudentPeopleError('CONFLICT', 'Guardian code belongs to a different guardian');
    }
    return existing;
  }

  createOrResolveRelationship(
    tx: TenantTransaction,
    tenantId: string,
    studentId: string,
    guardianId: string,
    input: GuardianRelationshipInput,
    audit: StudentPeopleAudit,
    persistence: StudentPeoplePersistence = defaultPersistence,
  ) {
    return persistence.createRelationship(tx, tenantId, studentId, guardianId, input, audit);
  }

  findRelationship(tx: TenantTransaction, tenantId: string, studentId: string, guardianId: string, persistence: StudentPeoplePersistence = defaultPersistence) {
    return persistence.findRelationship(tx, tenantId, studentId, guardianId);
  }

  getStudentById(tx: TenantTransaction, tenantId: string, studentId: string, persistence: StudentPeoplePersistence = defaultPersistence) {
    return persistence.readStudent(tx, tenantId, studentId);
  }

  getGuardianById(tx: TenantTransaction, tenantId: string, guardianId: string, persistence: StudentPeoplePersistence = defaultPersistence) {
    return persistence.readGuardian(tx, tenantId, guardianId);
  }
}
