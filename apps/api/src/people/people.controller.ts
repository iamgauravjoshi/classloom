import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  addStaffAffiliation, createStaffProfile, linkStaffMembership, listEligibleStaffAccounts,
  listSchoolStaff, listStaffAffiliationSchoolIds, listStaffSchools, readSchoolStaff,
  StaffError, unlinkStaffMembership, updateStaffAffiliation, updateStaffProfile,
  upsertTeacherProfile, withTenantContext, type TenantTransaction,
} from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { PeopleService, type PeopleActor } from './people.service.js';

const uuid = z.string().uuid();
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const profileFields = {
  givenName: z.string().trim().min(2).max(120), familyName: z.string().trim().min(2).max(120),
  preferredName: optionalText(120), workEmail: optionalText(254), phone: optionalText(30),
};
const affiliationFields = {
  designation: z.string().trim().min(1).max(120), startDate: z.iso.date().nullable().optional(),
  kind: z.enum(['staff', 'teacher']), status: z.enum(['active', 'inactive']).optional(),
};
const teacherFields = { qualification: optionalText(240), specialization: optionalText(240) };
const createInput = z.object({ staffCode: z.string().trim().min(1).max(20), ...profileFields, ...affiliationFields, ...teacherFields }).strict();
const patchInput = z.object({
  profile: z.object(profileFields).partial().strict().optional(),
  affiliation: z.object(affiliationFields).partial().strict().optional(),
}).strict().refine((value) => value.profile || value.affiliation, 'Choose staff details to update');
const addAffiliationInput = z.object({ targetSchoolId: uuid, ...affiliationFields }).strict();
const teacherInput = z.object(teacherFields).strict();
const accountInput = z.object({ membershipId: uuid }).strict();
const listFilters = z.object({
  q: z.string().max(120).optional(), status: z.enum(['active', 'inactive']).optional(),
  kind: z.enum(['staff', 'teacher']).optional(), cursor: z.string().max(1000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

function actorFrom(request: AuthenticatedRequest): PeopleActor {
  const auth = request.auth;
  if (!auth?.tenantId || !auth.accountId || !auth.activeMembershipId) throw new ForbiddenException('Choose an active workspace');
  return { tenantId: auth.tenantId, accountId: auth.accountId, membershipId: auth.activeMembershipId, requestId: request.requestId };
}

function mapStaffError(error: unknown): never {
  if (error instanceof StaffError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  throw error;
}

@ApiTags('People')
@Controller('people')
@UseGuards(AuthGuard)
export class PeopleSchoolsController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(PeopleService) private readonly people: PeopleService) {}

  @Get('schools')
  async schools(@Req() request: AuthenticatedRequest) {
    const actor = actorFrom(request);
    const candidates = await withTenantContext(this.database.db, actor.tenantId, (tx) => listStaffSchools(tx, actor.tenantId));
    const allowed = await Promise.all(candidates.map(async (school) => ({ school, allowed: await this.people.canReadSchool(actor, school.id) })));
    return allowed.filter((item) => item.allowed).map((item) => item.school);
  }
}

@ApiTags('People')
@Controller('people/schools/:schoolId')
@UseGuards(AuthGuard, CsrfGuard)
export class PeopleController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(PeopleService) private readonly people: PeopleService) {}

  private async detail(tx: TenantTransaction, actor: PeopleActor, schoolId: string, staffId: string) {
    const record = await readSchoolStaff(tx, { tenantId: actor.tenantId, schoolId }, staffId);
    const schoolIds = await listStaffAffiliationSchoolIds(tx, actor.tenantId, staffId);
    return { ...record, canEditShared: await this.people.canEditShared(actor, schoolIds) };
  }

  private async sharedMutation<T>(actor: PeopleActor, schoolId: string, staffId: string, work: (tx: TenantTransaction) => Promise<T>): Promise<T> {
    await this.people.requireSchoolRead(actor, schoolId);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      await readSchoolStaff(tx, { tenantId: actor.tenantId, schoolId }, staffId);
      await this.people.requireSharedManage(actor, await listStaffAffiliationSchoolIds(tx, actor.tenantId, staffId));
      return work(tx);
    });
  }

  @Get('staff')
  async list(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Query() query: unknown) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.people.requireSchoolRead(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => listSchoolStaff(tx, { tenantId: actor.tenantId, schoolId }, parseRequest(listFilters, query))); }
    catch (error) { return mapStaffError(error); }
  }

  @Get('staff/:staffId')
  async read(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('staffId') staffIdValue: string) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const staffId = parseRequest(uuid, staffIdValue);
    await this.people.requireSchoolRead(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => this.detail(tx, actor, schoolId, staffId)); }
    catch (error) { return mapStaffError(error); }
  }

  @Get('eligible-accounts')
  async accounts(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.people.requireSchoolManage(actor, schoolId);
    return withTenantContext(this.database.db, actor.tenantId, (tx) => listEligibleStaffAccounts(tx, { tenantId: actor.tenantId, schoolId }));
  }

  @Post('staff')
  async create(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Body() body: unknown) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.people.requireSchoolManage(actor, schoolId);
    const input = parseRequest(createInput, body);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, (tx) => createStaffProfile(tx, { tenantId: actor.tenantId, schoolId }, {
        profile: { staffCode: input.staffCode, givenName: input.givenName, familyName: input.familyName, preferredName: input.preferredName, workEmail: input.workEmail, phone: input.phone },
        affiliation: { designation: input.designation, startDate: input.startDate, kind: input.kind, status: input.status },
        teacher: input.kind === 'teacher' ? { qualification: input.qualification, specialization: input.specialization } : undefined,
      }, { actorAccountId: actor.accountId, requestId: actor.requestId }));
    } catch (error) { return mapStaffError(error); }
  }

  @Patch('staff/:staffId')
  async update(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('staffId') staffIdValue: string, @Body() body: unknown) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const staffId = parseRequest(uuid, staffIdValue);
    const input = parseRequest(patchInput, body);
    await this.people.requireSchoolManage(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
        const scope = { tenantId: actor.tenantId, schoolId };
        await readSchoolStaff(tx, scope, staffId);
        if (input.profile) {
          await this.people.requireSharedManage(actor, await listStaffAffiliationSchoolIds(tx, actor.tenantId, staffId));
          await updateStaffProfile(tx, scope, staffId, input.profile, { actorAccountId: actor.accountId, requestId: actor.requestId });
        }
        if (input.affiliation) await updateStaffAffiliation(tx, scope, staffId, input.affiliation, { actorAccountId: actor.accountId, requestId: actor.requestId });
        return this.detail(tx, actor, schoolId, staffId);
      });
    } catch (error) { return mapStaffError(error); }
  }

  @Post('staff/:staffId/affiliations')
  async addAffiliation(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('staffId') staffIdValue: string, @Body() body: unknown) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const staffId = parseRequest(uuid, staffIdValue);
    const input = parseRequest(addAffiliationInput, body);
    await this.people.requireSchoolRead(actor, schoolId);
    await this.people.requireSchoolManage(actor, input.targetSchoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => addStaffAffiliation(tx, { tenantId: actor.tenantId, schoolId }, input.targetSchoolId, staffId, input, { actorAccountId: actor.accountId, requestId: actor.requestId })); }
    catch (error) { return mapStaffError(error); }
  }

  @Put('staff/:staffId/teacher')
  async teacher(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('staffId') staffIdValue: string, @Body() body: unknown) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const staffId = parseRequest(uuid, staffIdValue);
    const input = parseRequest(teacherInput, body);
    try { return await this.sharedMutation(actor, schoolId, staffId, (tx) => upsertTeacherProfile(tx, { tenantId: actor.tenantId, schoolId }, staffId, input, { actorAccountId: actor.accountId, requestId: actor.requestId })); }
    catch (error) { return mapStaffError(error); }
  }

  @Put('staff/:staffId/account')
  async linkAccount(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('staffId') staffIdValue: string, @Body() body: unknown) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const staffId = parseRequest(uuid, staffIdValue);
    const input = parseRequest(accountInput, body);
    try { return await this.sharedMutation(actor, schoolId, staffId, (tx) => linkStaffMembership(tx, { tenantId: actor.tenantId, schoolId }, staffId, input.membershipId, { actorAccountId: actor.accountId, requestId: actor.requestId })); }
    catch (error) { return mapStaffError(error); }
  }

  @Delete('staff/:staffId/account')
  async unlinkAccount(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('staffId') staffIdValue: string) {
    const actor = actorFrom(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const staffId = parseRequest(uuid, staffIdValue);
    try { return await this.sharedMutation(actor, schoolId, staffId, (tx) => unlinkStaffMembership(tx, { tenantId: actor.tenantId, schoolId }, staffId, { actorAccountId: actor.accountId, requestId: actor.requestId })); }
    catch (error) { return mapStaffError(error); }
  }
}
