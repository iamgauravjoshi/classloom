import { ForbiddenException, Inject, Injectable, Optional } from '@nestjs/common';
import { getAttendanceTeacherLink, isAssignableTeacher, listAssignableTeacherAccounts, type StaffScope, type TenantTransaction } from '@classloom/db';
import { AuthorizationService } from '../authorization/authorization.service.js';

export type PeopleActor = { tenantId: string; accountId: string; membershipId: string; requestId?: string };

@Injectable()
export class PeopleService {
  constructor(
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Optional() private readonly attendanceTeacherLinkReader: typeof getAttendanceTeacherLink = getAttendanceTeacherLink,
  ) {}

  async canReadSchool(actor: PeopleActor, schoolId: string): Promise<boolean> {
    return this.authorization.hasPermissions(actor, ['staff.read'], { kind: 'school', schoolId });
  }

  getAttendanceTeacherLink(tx: TenantTransaction, scope: StaffScope, membershipId: string) {
    return this.attendanceTeacherLinkReader(tx, scope, membershipId);
  }

  async canManageSchool(actor: PeopleActor, schoolId: string): Promise<boolean> {
    return this.authorization.hasPermissions(actor, ['staff.manage'], { kind: 'school', schoolId });
  }

  async requireSchoolRead(actor: PeopleActor, schoolId: string): Promise<void> {
    if (!await this.canReadSchool(actor, schoolId)) throw new ForbiddenException('Staff directory access is not allowed for this school');
  }

  async requireSchoolManage(actor: PeopleActor, schoolId: string): Promise<void> {
    if (!await this.canManageSchool(actor, schoolId)) throw new ForbiddenException('Staff changes are not allowed for this school');
  }

  async canEditShared(actor: PeopleActor, schoolIds: string[]): Promise<boolean> {
    if (!schoolIds.length) return false;
    const decisions = await Promise.all(schoolIds.map((schoolId) => this.canManageSchool(actor, schoolId)));
    return decisions.every(Boolean);
  }

  async requireSharedManage(actor: PeopleActor, schoolIds: string[]): Promise<void> {
    if (!await this.canEditShared(actor, schoolIds)) throw new ForbiddenException('Managing shared staff details requires access to every affiliated school');
  }

  canAssignTeacher(tx: TenantTransaction, scope: StaffScope, membershipId: string): Promise<boolean> {
    return isAssignableTeacher(tx, scope, membershipId);
  }

  listAssignableTeachers(tx: TenantTransaction, scope: StaffScope) {
    return listAssignableTeacherAccounts(tx, scope);
  }
}
