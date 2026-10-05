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

  async listAttendanceSections(tx: TenantTransaction, scope: AcademicScope, sessionId: string, membershipId?: string) {
    const setup = await this.setupReader(tx, scope);
    if (!setup.sessions.some((session) => session.id === sessionId)) {
      throw new AcademicSetupError('NOT_FOUND', 'Academic session was not found in this school');
    }
    const classById = new Map(setup.classes.filter((item) => item.sessionId === sessionId).map((item) => [item.id, item]));
    const assignedSectionIds = membershipId === undefined
      ? null
      : new Set(setup.assignments.filter((item) => item.sessionId === sessionId && item.membershipId === membershipId).map((item) => item.sectionId));
    return setup.sections.filter((section) => section.sessionId === sessionId && (!assignedSectionIds || assignedSectionIds.has(section.id)))
      .flatMap((section) => {
        const academicClass = classById.get(section.classId);
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
  }

  async listAttendanceSessions(tx: TenantTransaction, scope: AcademicScope) {
    const setup = await this.setupReader(tx, scope);
    return setup.sessions.map(({ id, name, code, startDate, endDate, status }) => ({ id, name, code, startDate, endDate, status }));
  }

  async requireFinancePlanClass(tx: TenantTransaction, scope: AcademicScope, sessionId: string, classId: string) {
    const setup = await this.setupReader(tx, scope);
    const session = setup.sessions.find((item) => item.id === sessionId);
    const academicClass = setup.classes.find((item) => item.id === classId && item.sessionId === sessionId);
    if (!session || !academicClass) throw new AcademicSetupError('NOT_FOUND', 'Academic class was not found in this school and session');
    return { session, academicClass };
  }

  async listFinanceOptions(tx: TenantTransaction, scope: AcademicScope) {
    const setup = await this.setupReader(tx, scope);
    return {
      sessions: setup.sessions.map(({ id, name, startDate, endDate, status }) => ({ id, name, startDate, endDate, status })),
      classes: setup.classes.map(({ id, sessionId, name }) => ({ id, sessionId, name })),
    };
  }

  async listExaminationOptions(tx: TenantTransaction, scope: AcademicScope) {
    const setup = await this.setupReader(tx, scope);
    return {
      sessions: setup.sessions.map(({ id, name, startDate, endDate }) => ({ id, name, startDate, endDate })),
      classes: setup.classes.map(({ id, sessionId, name }) => ({ id, sessionId, name })),
      sections: setup.sections.map(({ id, sessionId, classId, name }) => ({ id, sessionId, classId, name })),
      subjects: setup.subjects.map(({ id, sessionId, name }) => ({ id, sessionId, name })),
      assignments: setup.assignments.map(({ sessionId, sectionId, subjectId, membershipId }) => ({ sessionId, sectionId, subjectId, membershipId })),
    };
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
