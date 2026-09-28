import { ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AttendanceError,
  getAttendanceSchool,
  getDailyAttendanceRegister,
  listDailyAttendanceEvents,
  listAttendanceSchools,
  readDailyAttendance,
  saveDailyAttendance,
  withTenantContext,
  type AttendanceRegisterInput,
  type AttendanceScope,
  type AttendanceStatus,
  type AttendanceActor,
  type TenantTransaction,
} from '@classloom/db';
import { AcademicsService } from '../academics/academics.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { DatabaseService } from '../database/database.service.js';
import { EnrollmentService } from '../enrollment/enrollment.service.js';
import { PeopleService } from '../people/people.service.js';

export type AttendanceUserActor = AttendanceActor & { tenantId: string; accountId: string; membershipId: string };
export type AttendancePersistence = {
  read: typeof readDailyAttendance;
  save: typeof saveDailyAttendance;
  register: typeof getDailyAttendanceRegister;
  events: typeof listDailyAttendanceEvents;
};
export const ATTENDANCE_PERSISTENCE = Symbol('ATTENDANCE_PERSISTENCE');
const defaultPersistence: AttendancePersistence = {
  read: readDailyAttendance,
  save: saveDailyAttendance,
  register: getDailyAttendanceRegister,
  events: listDailyAttendanceEvents,
};
export type TenantRunner = typeof withTenantContext;
export type AttendanceSchoolReader = typeof getAttendanceSchool;

export function schoolLocalDate(now: Date, timeZone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
  } catch {
    throw new AttendanceError('INVALID', 'This school has an invalid timezone setting');
  }
  const values = Object.fromEntries(parts.filter((part) => ['year', 'month', 'day'].includes(part.type)).map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(EnrollmentService) private readonly enrollment: EnrollmentService,
    @Inject(AcademicsService) private readonly academics: AcademicsService,
    @Inject(PeopleService) private readonly people: PeopleService,
    @Optional() @Inject(ATTENDANCE_PERSISTENCE) private readonly persistence: AttendancePersistence = defaultPersistence,
    @Optional() private readonly tenantRunner: TenantRunner = withTenantContext,
    @Optional() private readonly schoolReader: AttendanceSchoolReader = getAttendanceSchool,
  ) {}

  private async allowed(actor: AttendanceUserActor, schoolId: string, permission: 'attendance.read' | 'attendance.record') {
    return this.authorization.hasPermissions(actor, [permission], { kind: 'school', schoolId });
  }

  private async requireRead(actor: AttendanceUserActor, schoolId: string) {
    const [read, record] = await Promise.all([
      this.allowed(actor, schoolId, 'attendance.read'), this.allowed(actor, schoolId, 'attendance.record'),
    ]);
    if (!read && !record) throw new ForbiddenException('Attendance access is not allowed for this school');
  }

  private async school(tx: TenantTransaction, tenantId: string, schoolId: string) {
    const school = await this.schoolReader(tx, { tenantId, schoolId });
    if (!school) throw new NotFoundException('School was not found');
    return school;
  }

  async listSchools(actor: AttendanceUserActor) {
    return this.tenantRunner(this.database.db, actor.tenantId, async (tx) => {
      const schools = await listAttendanceSchools(tx, actor.tenantId);
      const results = await Promise.all(schools.map(async (school) => {
        const [canReadAttendance, canRecordAttendance] = await Promise.all([
          this.allowed(actor, school.id, 'attendance.read'), this.allowed(actor, school.id, 'attendance.record'),
        ]);
        return { ...school, today: schoolLocalDate(new Date(), school.timezone), canReadAttendance, canRecordAttendance };
      }));
      return results.filter((school) => school.canReadAttendance || school.canRecordAttendance);
    });
  }

  async listSessions(actor: AttendanceUserActor, scope: AttendanceScope) {
    await this.requireRead(actor, scope.schoolId);
    if (actor.tenantId !== scope.tenantId) throw new NotFoundException('School was not found');
    return this.tenantRunner(this.database.db, scope.tenantId, async (tx) => {
      await this.school(tx, scope.tenantId, scope.schoolId);
      return this.academics.listAttendanceSessions(tx, scope);
    });
  }

  async listSections(actor: AttendanceUserActor, scope: AttendanceScope, sessionId: string) {
    await this.requireRead(actor, scope.schoolId);
    if (actor.tenantId !== scope.tenantId) throw new NotFoundException('School was not found');
    return this.tenantRunner(this.database.db, scope.tenantId, async (tx) => {
      await this.school(tx, scope.tenantId, scope.schoolId);
      const link = await this.people.getAttendanceTeacherLink(tx, scope, actor.membershipId);
      if (link.linked && !link.eligible) return [];
      return this.academics.listAttendanceSections(tx, scope, sessionId, link.linked ? actor.membershipId : undefined);
    });
  }

  private async resolveRegisterContext(
    tx: TenantTransaction,
    actor: AttendanceUserActor,
    scope: AttendanceScope,
    key: Pick<AttendanceRegisterInput, 'sessionId' | 'sectionId' | 'date'>,
  ) {
    const school = await this.school(tx, scope.tenantId, scope.schoolId);
    const sessions = await this.academics.listAttendanceSessions(tx, scope);
    const session = sessions.find((item) => item.id === key.sessionId);
    if (!session) throw new NotFoundException('Academic session was not found in this school');
    if (key.date < session.startDate || key.date > session.endDate) {
      throw new AttendanceError('INVALID', 'Choose a date within the selected academic session');
    }
    if (key.date > schoolLocalDate(new Date(), school.timezone)) {
      throw new AttendanceError('INVALID', 'Attendance cannot be recorded for a future date');
    }
    const link = await this.people.getAttendanceTeacherLink(tx, scope, actor.membershipId);
    if (link.linked && !link.eligible) throw new NotFoundException('Section was not found in this school');
    const sections = await this.academics.listAttendanceSections(tx, scope, key.sessionId, link.linked ? actor.membershipId : undefined);
    if (!sections.some((section) => section.id === key.sectionId)) throw new NotFoundException('Section was not found in this school');
    const roster = await this.enrollment.listAttendanceRoster(tx, scope, key.sessionId, key.sectionId, key.date);
    return { roster, key };
  }

  async readRegister(actor: AttendanceUserActor, scope: AttendanceScope, key: Pick<AttendanceRegisterInput, 'sessionId' | 'sectionId' | 'date'>) {
    await this.requireRead(actor, scope.schoolId);
    if (actor.tenantId !== scope.tenantId) throw new NotFoundException('Attendance register was not found');
    return this.tenantRunner(this.database.db, scope.tenantId, async (tx) => {
      const { roster } = await this.resolveRegisterContext(tx, actor, scope, key);
      return this.persistence.read(tx, scope, key, roster);
    });
  }

  async saveRegister(
    actor: AttendanceUserActor,
    scope: AttendanceScope,
    key: Pick<AttendanceRegisterInput, 'sessionId' | 'sectionId' | 'date'>,
    entries: { academicEnrollmentId: string; status: AttendanceStatus }[],
  ) {
    if (actor.tenantId !== scope.tenantId) throw new NotFoundException('Attendance register was not found');
    if (!await this.allowed(actor, scope.schoolId, 'attendance.record')) {
      throw new ForbiddenException('Recording attendance is not allowed for this school');
    }
    const actorAudit: AttendanceActor = { accountId: actor.accountId, membershipId: actor.membershipId, requestId: actor.requestId };
    return this.tenantRunner(this.database.db, scope.tenantId, async (tx) => {
      const { roster } = await this.resolveRegisterContext(tx, actor, scope, key);
      return this.persistence.save(tx, scope, { ...key, entries }, roster, actorAudit);
    });
  }

  async readHistory(actor: AttendanceUserActor, scope: AttendanceScope, registerId: string) {
    await this.requireRead(actor, scope.schoolId);
    if (actor.tenantId !== scope.tenantId) throw new NotFoundException('Attendance register was not found');
    return this.tenantRunner(this.database.db, scope.tenantId, async (tx) => {
      const register = await this.persistence.register(tx, scope, registerId);
      if (!register) throw new NotFoundException('Attendance register was not found');
      await this.resolveRegisterContext(tx, actor, scope, {
        sessionId: register.sessionId, sectionId: register.sectionId, date: register.attendanceDate,
      });
      const events = await this.persistence.events(tx, scope, registerId);
      return events.map(({ previousStatus, status, createdAt, requestId }) => ({ previousStatus, status, createdAt, requestId }));
    });
  }
}
