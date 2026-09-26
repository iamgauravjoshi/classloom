import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createStudentProfile,
  linkStudentMembership,
  listActiveStudentSchoolIds,
  listSchoolStudentIds,
  listStudentGuardians,
  listStudentProfilesByIds,
  readStudentProfile,
  setStudentStatus,
  StudentPeopleError,
  unlinkStudentMembership,
  updateStudentProfile,
  withTenantContext,
} from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { StudentPeopleService, type StudentPeopleActor } from '../people/student-people.service.js';

const uuid = z.string().uuid();
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const profileFields = {
  givenName: z.string().trim().min(2).max(120), middleName: optionalText(120),
  familyName: z.string().trim().min(2).max(120), preferredName: optionalText(120),
  dateOfBirth: z.iso.date(), gender: optionalText(50), email: optionalText(254), phone: optionalText(30),
};
const createInput = z.object({ studentCode: z.string().trim().min(1).max(20), ...profileFields }).strict();
const patchInput = z.object({ ...profileFields, status: z.enum(['active', 'inactive']).optional() }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'Choose student details to update');
const accountInput = z.object({ membershipId: uuid }).strict();
const listFilters = z.object({
  q: z.string().trim().max(120).optional(), status: z.enum(['active', 'inactive']).optional(),
  sessionId: uuid.optional(), classId: uuid.optional(), sectionId: uuid.optional(),
  cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

export function studentPeopleActor(request: AuthenticatedRequest): StudentPeopleActor {
  const auth = request.auth;
  if (!auth?.tenantId || !auth.accountId || !auth.activeMembershipId) throw new ForbiddenException('Choose an active workspace');
  return { tenantId: auth.tenantId, accountId: auth.accountId, membershipId: auth.activeMembershipId, requestId: request.requestId };
}

export function mapStudentPeopleError(error: unknown): never {
  if (error instanceof StudentPeopleError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  throw error;
}

@ApiTags('Students')
@Controller('people/schools/:schoolId/students')
@UseGuards(AuthGuard, CsrfGuard)
export class StudentDirectoryController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StudentPeopleService) private readonly people: StudentPeopleService,
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Query() query: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const filters = parseRequest(listFilters, query);
    await this.people.requireStudentRead(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
        const ids = await listSchoolStudentIds(tx, { tenantId: actor.tenantId, schoolId }, filters);
        return listStudentProfilesByIds(tx, actor.tenantId, ids, filters);
      });
    } catch (error) { return mapStudentPeopleError(error); }
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.people.requireStudentManage(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, (tx) => createStudentProfile(
        tx, actor.tenantId, parseRequest(createInput, body), { actorAccountId: actor.accountId, requestId: actor.requestId },
      ));
    } catch (error) { return mapStudentPeopleError(error); }
  }

  @Get(':studentId')
  async read(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    await this.people.requireStudentRead(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
        const visibleIds = await listSchoolStudentIds(tx, { tenantId: actor.tenantId, schoolId });
        if (!visibleIds.includes(studentId)) throw new StudentPeopleError('NOT_FOUND', 'Student was not found in this school');
        const profile = await readStudentProfile(tx, actor.tenantId, studentId);
        const activeSchoolIds = await listActiveStudentSchoolIds(tx, actor.tenantId, studentId);
        return { ...profile, guardians: await listStudentGuardians(tx, actor.tenantId, studentId), canEditShared: activeSchoolIds.length > 0 && await Promise.all(activeSchoolIds.map((id) => this.people.requireStudentManage(actor, id).then(() => true, () => false))).then((results) => results.every(Boolean)) };
      });
    } catch (error) { return mapStudentPeopleError(error); }
  }

  @Patch(':studentId')
  async update(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    const input = parseRequest(patchInput, body);
    await this.people.requireStudentRead(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
        const visibleIds = await listSchoolStudentIds(tx, { tenantId: actor.tenantId, schoolId });
        if (!visibleIds.includes(studentId)) throw new StudentPeopleError('NOT_FOUND', 'Student was not found in this school');
        await this.people.requireSharedStudentManage(actor, await listActiveStudentSchoolIds(tx, actor.tenantId, studentId));
        const { status, ...profile } = input;
        if (Object.keys(profile).length) await updateStudentProfile(tx, actor.tenantId, studentId, profile, { actorAccountId: actor.accountId, requestId: actor.requestId });
        if (status) await setStudentStatus(tx, actor.tenantId, studentId, status, { actorAccountId: actor.accountId, requestId: actor.requestId });
        return readStudentProfile(tx, actor.tenantId, studentId);
      });
    } catch (error) { return mapStudentPeopleError(error); }
  }

  @Put(':studentId/account')
  async linkAccount(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string, @Body() body: unknown) {
    return this.accountMutation(request, schoolIdValue, studentIdValue, parseRequest(accountInput, body).membershipId);
  }

  @Delete(':studentId/account')
  async unlinkAccount(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string) {
    return this.accountMutation(request, schoolIdValue, studentIdValue);
  }

  private async accountMutation(request: AuthenticatedRequest, schoolIdValue: string, studentIdValue: string, membershipId?: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    await this.people.requireStudentRead(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
        const visibleIds = await listSchoolStudentIds(tx, { tenantId: actor.tenantId, schoolId });
        if (!visibleIds.includes(studentId)) throw new StudentPeopleError('NOT_FOUND', 'Student was not found in this school');
        await this.people.requireSharedStudentManage(actor, await listActiveStudentSchoolIds(tx, actor.tenantId, studentId));
        const audit = { actorAccountId: actor.accountId, requestId: actor.requestId };
        return membershipId
          ? linkStudentMembership(tx, actor.tenantId, studentId, membershipId, audit)
          : unlinkStudentMembership(tx, actor.tenantId, studentId, audit);
      });
    } catch (error) { return mapStudentPeopleError(error); }
  }
}
