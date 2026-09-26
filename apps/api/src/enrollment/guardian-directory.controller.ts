import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createGuardianProfile,
  createOrUpdateGuardianRelationship,
  linkGuardianMembership,
  listActiveGuardianSchoolIds,
  listActiveStudentSchoolIds,
  listGuardianProfilesByIds,
  listGuardianStudents,
  listSchoolGuardianIds,
  readGuardianProfile,
  setGuardianStatus,
  StudentPeopleError,
  unlinkGuardianMembership,
  updateGuardianProfile,
  updateGuardianRelationship,
  withTenantContext,
} from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { StudentPeopleService } from '../people/student-people.service.js';
import { mapStudentPeopleError, studentPeopleActor } from './student-directory.controller.js';

const uuid = z.string().uuid();
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const guardianFields = {
  givenName: z.string().trim().min(2).max(120), middleName: optionalText(120), familyName: z.string().trim().min(2).max(120),
  preferredName: optionalText(120), email: optionalText(254), phone: optionalText(30), occupation: optionalText(120),
  addressLine1: optionalText(240), addressLine2: optionalText(240), city: optionalText(120), state: optionalText(120),
  postalCode: optionalText(30), countryCode: optionalText(2),
};
const createInput = z.object({ guardianCode: z.string().trim().min(1).max(20), ...guardianFields }).strict();
const patchInput = z.object({ ...guardianFields, status: z.enum(['active', 'inactive']).optional() }).partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'Choose guardian details to update');
const relationshipFields = {
  relationshipType: z.enum(['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other']),
  primaryContact: z.boolean().optional(), emergencyContact: z.boolean().optional(), authorizedPickup: z.boolean().optional(),
  financialResponsibility: z.boolean().optional(), portalAccess: z.boolean().optional(), status: z.enum(['active', 'inactive']).optional(),
};
const relationshipInput = z.object({ guardianId: uuid, ...relationshipFields }).strict();
const relationshipPatch = z.object(relationshipFields).partial().strict().refine((value) => Object.keys(value).length > 0, 'Choose relationship details to update');
const accountInput = z.object({ membershipId: uuid }).strict();
const listFilters = z.object({ q: z.string().trim().max(120).optional(), status: z.enum(['active', 'inactive']).optional(), cursor: uuid.optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).strict();

@ApiTags('Guardians')
@Controller('people/schools/:schoolId/guardians')
@UseGuards(AuthGuard, CsrfGuard)
export class GuardianDirectoryController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(StudentPeopleService) private readonly people: StudentPeopleService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Query() query: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const filters = parseRequest(listFilters, query);
    await this.people.requireGuardianRead(actor, schoolId);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, async (tx) => listGuardianProfilesByIds(
        tx, actor.tenantId, await listSchoolGuardianIds(tx, { tenantId: actor.tenantId, schoolId }), filters,
      ));
    } catch (error) { return mapStudentPeopleError(error); }
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.people.requireGuardianManage(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => createGuardianProfile(tx, actor.tenantId, parseRequest(createInput, body), { actorAccountId: actor.accountId, requestId: actor.requestId })); }
    catch (error) { return mapStudentPeopleError(error); }
  }

  @Get(':guardianId')
  async read(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('guardianId') guardianIdValue: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const guardianId = parseRequest(uuid, guardianIdValue);
    await this.people.requireGuardianRead(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      if (!(await listSchoolGuardianIds(tx, { tenantId: actor.tenantId, schoolId })).includes(guardianId)) throw new StudentPeopleError('NOT_FOUND', 'Guardian was not found in this school');
      return { ...await readGuardianProfile(tx, actor.tenantId, guardianId), students: await listGuardianStudents(tx, actor.tenantId, guardianId) };
    }); } catch (error) { return mapStudentPeopleError(error); }
  }

  @Patch(':guardianId')
  async update(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('guardianId') guardianIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const guardianId = parseRequest(uuid, guardianIdValue);
    const input = parseRequest(patchInput, body);
    await this.people.requireGuardianRead(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      if (!(await listSchoolGuardianIds(tx, { tenantId: actor.tenantId, schoolId })).includes(guardianId)) throw new StudentPeopleError('NOT_FOUND', 'Guardian was not found in this school');
      await this.people.requireSharedGuardianManage(actor, await listActiveGuardianSchoolIds(tx, actor.tenantId, guardianId));
      const { status, ...profile } = input;
      if (Object.keys(profile).length) await updateGuardianProfile(tx, actor.tenantId, guardianId, profile, { actorAccountId: actor.accountId, requestId: actor.requestId });
      if (status) await setGuardianStatus(tx, actor.tenantId, guardianId, status, { actorAccountId: actor.accountId, requestId: actor.requestId });
      return readGuardianProfile(tx, actor.tenantId, guardianId);
    }); } catch (error) { return mapStudentPeopleError(error); }
  }

  @Put(':guardianId/account')
  async linkAccount(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('guardianId') guardianId: string, @Body() body: unknown) {
    return this.accountMutation(request, schoolId, guardianId, parseRequest(accountInput, body).membershipId);
  }

  @Delete(':guardianId/account')
  async unlinkAccount(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('guardianId') guardianId: string) {
    return this.accountMutation(request, schoolId, guardianId);
  }

  private async accountMutation(request: AuthenticatedRequest, schoolIdValue: string, guardianIdValue: string, membershipId?: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const guardianId = parseRequest(uuid, guardianIdValue);
    await this.people.requireGuardianRead(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      if (!(await listSchoolGuardianIds(tx, { tenantId: actor.tenantId, schoolId })).includes(guardianId)) throw new StudentPeopleError('NOT_FOUND', 'Guardian was not found in this school');
      await this.people.requireSharedGuardianManage(actor, await listActiveGuardianSchoolIds(tx, actor.tenantId, guardianId));
      const audit = { actorAccountId: actor.accountId, requestId: actor.requestId };
      return membershipId ? linkGuardianMembership(tx, actor.tenantId, guardianId, membershipId, audit) : unlinkGuardianMembership(tx, actor.tenantId, guardianId, audit);
    }); } catch (error) { return mapStudentPeopleError(error); }
  }
}

@ApiTags('Guardians')
@Controller('people/schools/:schoolId/students/:studentId/guardians')
@UseGuards(AuthGuard, CsrfGuard)
export class StudentGuardianRelationshipController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(StudentPeopleService) private readonly people: StudentPeopleService) {}

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    const { guardianId, ...input } = parseRequest(relationshipInput, body);
    await Promise.all([this.people.requireStudentManage(actor, schoolId), this.people.requireGuardianManage(actor, schoolId)]);
    try { return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const activeSchoolIds = await listActiveStudentSchoolIds(tx, actor.tenantId, studentId);
      if (activeSchoolIds.length && !activeSchoolIds.includes(schoolId)) throw new StudentPeopleError('NOT_FOUND', 'Student was not found in this school');
      return createOrUpdateGuardianRelationship(tx, actor.tenantId, studentId, guardianId, input, { actorAccountId: actor.accountId, requestId: actor.requestId });
    }); }
    catch (error) { return mapStudentPeopleError(error); }
  }

  @Patch(':relationshipId')
  async update(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string, @Param('relationshipId') relationshipIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    const relationshipId = parseRequest(uuid, relationshipIdValue);
    const input = parseRequest(relationshipPatch, body);
    await Promise.all([this.people.requireStudentManage(actor, schoolId), this.people.requireGuardianManage(actor, schoolId)]);
    try { return await withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      const activeSchoolIds = await listActiveStudentSchoolIds(tx, actor.tenantId, studentId);
      if (activeSchoolIds.length && !activeSchoolIds.includes(schoolId)) throw new StudentPeopleError('NOT_FOUND', 'Student was not found in this school');
      return updateGuardianRelationship(tx, actor.tenantId, studentId, relationshipId, input, { actorAccountId: actor.accountId, requestId: actor.requestId });
    }); }
    catch (error) { return mapStudentPeopleError(error); }
  }
}
