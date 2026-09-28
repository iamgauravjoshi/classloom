import { Inject, Injectable, Optional } from '@nestjs/common';
import { AcademicSetupError, readAcademicSetup, resolveEnrollmentPlacement, resolveEnrollmentPlacementByCodes, type EnrollmentPlacementInput, type TenantTransaction } from '@classloom/db';
import { PeopleService } from '../people/people.service.js';

type AcademicScope = { tenantId: string; schoolId: string };

@Injectable()
export class AcademicsService {
  private readonly setupReader = readAcademicSetup;

  constructor(
    @Optional() private readonly resolver: typeof resolveEnrollmentPlacement = resolveEnrollmentPlacement,
    @Optional() @Inject(PeopleService) private readonly people?: PeopleService,
  ) {}

  requireEnrollmentPlacement(tx: TenantTransaction, scope: AcademicScope, input: EnrollmentPlacementInput) {
    return this.resolver(tx, scope, input);
  }

  requireEnrollmentPlacementByCodes(tx: TenantTransaction, scope: AcademicScope, input: { sessionCode: string; classCode: string; sectionCode: string }) {
    return resolveEnrollmentPlacementByCodes(tx, scope, input);
  }

  async listTimetableOptions(tx: TenantTransaction, scope: AcademicScope, sessionId: string) {
    const setup = await this.setupReader(tx, scope);
    if (!setup.sessions.some((session) => session.id === sessionId)) {
      throw new AcademicSetupError('NOT_FOUND', 'Academic session was not found in this school');
    }
    const classes = new Map(setup.classes.filter((item) => item.sessionId === sessionId).map((item) => [item.id, item]));
    const sections = setup.sections.filter((item) => item.sessionId === sessionId).flatMap((section) => {
      const academicClass = classes.get(section.classId);
      if (!academicClass) return [];
      return [{
        id: section.id,
        classId: academicClass.id,
        className: academicClass.name,
        classCode: academicClass.code,
        name: section.name,
        code: section.code,
        label: `${academicClass.name} · ${section.name}`,
      }];
    });
    const subjects = setup.subjects.filter((subject) => subject.sessionId === sessionId)
      .map(({ id, name, code }) => ({ id, name, code }));
    const candidateAssignments = setup.assignments.filter((assignment) => assignment.sessionId === sessionId);
    const eligibleTeachers = candidateAssignments.length && this.people
      ? await this.people.listAssignableTeachers(tx, scope)
      : [];
    const teacherByMembership = new Map(eligibleTeachers.map((teacher) => [teacher.id, teacher]));
    const teacherAssignments = candidateAssignments.flatMap((assignment) => {
      const teacher = teacherByMembership.get(assignment.membershipId);
      if (!teacher) return [];
      return [{
        id: assignment.id,
        sectionId: assignment.sectionId,
        subjectId: assignment.subjectId,
        membershipId: assignment.membershipId,
        displayName: teacher.displayName?.trim() || teacher.email,
      }];
    }).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.id.localeCompare(right.id));
    return { sections, subjects, teacherAssignments };
  }

  async requireTimetableAssignment(
    tx: TenantTransaction,
    scope: AcademicScope,
    sessionId: string,
    sectionId: string,
    subjectId: string,
    assignmentId: string,
  ): Promise<void> {
    const setup = await this.setupReader(tx, scope);
    const assignment = setup.assignments.find((item) => item.id === assignmentId && item.sessionId === sessionId &&
      item.sectionId === sectionId && item.subjectId === subjectId);
    if (!assignment) throw new AcademicSetupError('NOT_FOUND', 'Eligible teacher assignment was not found for this section and subject');
    if (!this.people || !await this.people.canAssignTeacher(tx, scope, assignment.membershipId)) {
      throw new AcademicSetupError('CONFLICT', 'The assigned teacher is no longer eligible for this school');
    }
  }
}
