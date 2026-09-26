import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import {
  AcademicSetupError,
  beginStudentImportBatch,
  completeStudentImportBatch,
  findActiveAcademicEnrollment,
  findActiveSchoolEnrollment,
  findGuardianByCode,
  findStudentByCode,
  securityEvents,
  type TenantTransaction,
} from '@classloom/db';
import { StudentPeopleService, type StudentPeopleActor } from '../people/student-people.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { AcademicsService } from '../academics/academics.service.js';
import { EnrollmentService } from './enrollment.service.js';
import { previewStudentCsv, type StudentCsvMapping, type StudentImportPreviewError } from './student-import.js';

export class StudentImportCommitError extends Error {
  constructor(readonly code: 'INVALID' | 'CONFLICT', message: string, readonly errors: StudentImportPreviewError[] = []) {
    super(message);
    this.name = 'StudentImportCommitError';
  }
}

function canonicalMapping(mapping: StudentCsvMapping) {
  return JSON.stringify(Object.fromEntries(Object.entries(mapping).filter(([, value]) => value).sort(([a], [b]) => a.localeCompare(b))));
}

export function studentImportChecksum(file: Buffer, mapping: StudentCsvMapping) {
  return createHash('sha256').update(file).update('\0').update(canonicalMapping(mapping)).digest('hex');
}

const studentFieldMap: Record<string, string> = {
  studentCode: 'studentCode', studentGivenName: 'givenName', studentMiddleName: 'middleName', studentFamilyName: 'familyName',
  studentPreferredName: 'preferredName', dateOfBirth: 'dateOfBirth', studentGender: 'gender', studentEmail: 'email', studentPhone: 'phone',
};
const guardianFieldMap: Record<string, string> = {
  guardianCode: 'guardianCode', guardianGivenName: 'givenName', guardianMiddleName: 'middleName', guardianFamilyName: 'familyName',
  guardianPreferredName: 'preferredName', guardianEmail: 'email', guardianPhone: 'phone', guardianOccupation: 'occupation',
  guardianAddressLine1: 'addressLine1', guardianAddressLine2: 'addressLine2', guardianCity: 'city', guardianState: 'state',
  guardianPostalCode: 'postalCode', guardianCountryCode: 'countryCode',
};

function conflictingField(record: Record<string, unknown>, candidate: Record<string, unknown>, provided: string[], map: Record<string, string>) {
  return provided.find((field) => {
    const key = map[field];
    return key && (record[key] ?? null) !== (candidate[key] ?? null);
  });
}

@Injectable()
export class StudentImportService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Optional() @Inject(StudentPeopleService) private readonly people?: StudentPeopleService,
    @Optional() @Inject(AcademicsService) private readonly academics?: AcademicsService,
    @Optional() @Inject(EnrollmentService) private readonly enrollment?: EnrollmentService,
  ) {}

  async requireCommit(actor: StudentPeopleActor, schoolId: string) {
    const allowed = await this.authorization.hasPermissions(actor, [
      'student.manage', 'guardian.manage', 'enrollment.manage',
    ], { kind: 'school', schoolId });
    if (!allowed) throw new ForbiddenException('Student import requires student, guardian, and enrollment management access for this school');
  }

  preview(file: Buffer, mapping: StudentCsvMapping) {
    return previewStudentCsv(file, mapping);
  }

  async previewInContext(tx: TenantTransaction, actor: StudentPeopleActor, schoolId: string, file: Buffer, mapping: StudentCsvMapping) {
    await this.requireCommit(actor, schoolId);
    if (!this.academics) throw new Error('Student import academic contract is unavailable');
    const preview = previewStudentCsv(file, mapping);
    const scope = { tenantId: actor.tenantId, schoolId };
    for (const command of preview.commands) {
      const row = command.sourceRows[0]!;
      const existingStudent = await findStudentByCode(tx, actor.tenantId, command.student.studentCode);
      if (existingStudent) {
        const field = conflictingField(existingStudent as unknown as Record<string, unknown>, command.student, command.providedFields, studentFieldMap);
        if (field) preview.errors.push({ row, field: field as StudentImportPreviewError['field'], message: 'Student code conflicts with an existing profile' });
      }
      let placement: Awaited<ReturnType<AcademicsService['requireEnrollmentPlacementByCodes']>> | null = null;
      try { placement = await this.academics.requireEnrollmentPlacementByCodes(tx, scope, command.placement); }
      catch (error) {
        if (!(error instanceof AcademicSetupError)) throw error;
        preview.errors.push({ row, field: 'sessionCode', message: 'Academic session, class, or section was not found or is archived' });
      }
      if (existingStudent) {
        const schoolEnrollment = await findActiveSchoolEnrollment(tx, scope, existingStudent.id);
        if (schoolEnrollment && schoolEnrollment.admissionNumber.trim().toUpperCase() !== command.schoolEnrollment.admissionNumber) {
          preview.errors.push({ row, field: 'admissionNumber', message: 'Student has a different active admission number' });
        }
        if (placement) {
          const academic = await findActiveAcademicEnrollment(tx, scope, existingStudent.id, placement.sessionId);
          if (academic && (academic.classId !== placement.classId || academic.sectionId !== placement.sectionId ||
            (academic.rollNumber?.trim().toUpperCase() ?? null) !== command.placement.rollNumber)) {
            preview.errors.push({ row, field: 'sectionCode', message: 'Student has a different active academic placement' });
          }
        }
      }
      for (const linked of command.guardians) {
        const existingGuardian = await findGuardianByCode(tx, actor.tenantId, linked.guardian.guardianCode);
        if (!existingGuardian) continue;
        const field = conflictingField(existingGuardian as unknown as Record<string, unknown>, linked.guardian, linked.providedFields, guardianFieldMap);
        if (field) preview.errors.push({ row, field: field as StudentImportPreviewError['field'], message: 'Guardian code conflicts with an existing profile' });
      }
    }
    return preview;
  }

  async commit(
    tx: TenantTransaction,
    actor: StudentPeopleActor,
    schoolId: string,
    file: Buffer,
    mapping: StudentCsvMapping,
    idempotencyKey: string,
  ) {
    await this.requireCommit(actor, schoolId);
    if (!this.people || !this.academics || !this.enrollment) throw new Error('Student import dependencies are unavailable');
    const preview = previewStudentCsv(file, mapping);
    if (preview.errors.length) throw new StudentImportCommitError('INVALID', 'Fix the CSV errors before importing', preview.errors);
    const scope = { tenantId: actor.tenantId, schoolId };
    const checksum = studentImportChecksum(file, mapping);
    const started = await beginStudentImportBatch(tx, scope, actor.accountId, idempotencyKey, checksum);
    if (started.replayed) {
      return {
        batchId: started.batch.id, replayed: true,
        studentCount: started.batch.studentCount, guardianCount: started.batch.guardianCount, enrollmentCount: started.batch.enrollmentCount,
      };
    }

    const guardianIds = new Set<string>();
    let enrollmentCount = 0;
    for (const command of preview.commands) {
      const student = await this.people.createOrResolveStudent(tx, actor.tenantId, command.student, {
        actorAccountId: actor.accountId, requestId: actor.requestId,
      });
      const studentConflict = conflictingField(student as unknown as Record<string, unknown>, command.student, command.providedFields, studentFieldMap);
      if (studentConflict) throw new StudentImportCommitError('CONFLICT', `Student ${command.student.studentCode} conflicts in ${studentConflict}`);
      const placement = await this.academics.requireEnrollmentPlacementByCodes(tx, scope, command.placement);

      let schoolEnrollment = await findActiveSchoolEnrollment(tx, scope, student.id);
      if (schoolEnrollment) {
        if (schoolEnrollment.admissionNumber.trim().toUpperCase() !== command.schoolEnrollment.admissionNumber) {
          throw new StudentImportCommitError('CONFLICT', `Student ${command.student.studentCode} has a different active admission number`);
        }
      } else {
        schoolEnrollment = await this.enrollment.createSchoolEnrollment(tx, actor, schoolId, student.id, {
          admissionNumber: command.schoolEnrollment.admissionNumber,
          admissionDate: placement.sessionStartDate,
        });
        enrollmentCount += 1;
      }

      const academic = await findActiveAcademicEnrollment(tx, scope, student.id, placement.sessionId);
      if (academic) {
        if (academic.classId !== placement.classId || academic.sectionId !== placement.sectionId ||
          (academic.rollNumber?.trim().toUpperCase() ?? null) !== command.placement.rollNumber) {
          throw new StudentImportCommitError('CONFLICT', `Student ${command.student.studentCode} has a different active academic placement`);
        }
      } else {
        await this.enrollment.createAcademicEnrollment(tx, actor, schoolId, schoolEnrollment.id, {
          sessionId: placement.sessionId, classId: placement.classId, sectionId: placement.sectionId,
          rollNumber: command.placement.rollNumber, startDate: placement.sessionStartDate,
        });
      }

      for (const guardianCommand of command.guardians) {
        const guardian = await this.people.createOrResolveGuardian(tx, actor.tenantId, guardianCommand.guardian, {
          actorAccountId: actor.accountId, requestId: actor.requestId,
        });
        const guardianConflict = conflictingField(guardian as unknown as Record<string, unknown>, guardianCommand.guardian, guardianCommand.providedFields, guardianFieldMap);
        if (guardianConflict) throw new StudentImportCommitError('CONFLICT', `Guardian ${guardianCommand.guardian.guardianCode} conflicts in ${guardianConflict}`);
        guardianIds.add(guardian.id);
        await this.people.createOrResolveRelationship(tx, actor.tenantId, student.id, guardian.id, guardianCommand.relationship, {
          actorAccountId: actor.accountId, requestId: actor.requestId,
        });
      }
    }

    const counts = { studentCount: preview.commands.length, guardianCount: guardianIds.size, enrollmentCount };
    const completed = await completeStudentImportBatch(tx, scope, started.batch.id, counts);
    await tx.insert(securityEvents).values({
      eventType: 'student_import_completed', tenantId: actor.tenantId, accountId: actor.accountId, requestId: actor.requestId,
      metadata: { schoolId, batchId: completed.id, ...counts },
    });
    return { batchId: completed.id, replayed: false, ...counts };
  }
}
