import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AcademicSetupError, activateAcademicSession, createAcademicAssignment, createAcademicClass, createAcademicSection, createAcademicSession, createAcademicSubject, listAcademicSchools, readAcademicSetup, withTenantContext } from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { DatabaseService } from '../database/database.service.js';
import { parseRequest } from '../common/request-validation.js';
import { PeopleService } from '../people/people.service.js';

const uuid = z.string().uuid();
const named = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(1).max(20) }).strict();
const sessionInput = named.extend({ startDate: z.iso.date(), endDate: z.iso.date() });
const classInput = named.extend({ sortOrder: z.number().int().min(0).max(999).optional() });
const sectionInput = named.extend({ capacity: z.number().int().positive().max(1000).optional() });
const assignmentInput = z.object({ subjectId: uuid, membershipId: uuid }).strict();

const parse = parseRequest;

function mapError(error: unknown): never {
  if (error instanceof AcademicSetupError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  const pgCode = (error as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === '23505') throw new ConflictException('An academic record with this code or assignment already exists');
  if (pgCode === '23503') throw new BadRequestException('Related academic record was not found in this school');
  throw error;
}

@ApiTags('Academics')
@Controller('academics/schools/:schoolId')
@UseGuards(AuthGuard, CsrfGuard)
export class AcademicsController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(PeopleService) private readonly people: PeopleService,
  ) {}

  private async scope(request: AuthenticatedRequest, schoolIdValue: string, permission: 'school.read' | 'school.manage') {
    const schoolId = parse(uuid, schoolIdValue);
    const auth = request.auth;
    if (!auth?.tenantId || !auth.accountId || !auth.activeMembershipId) throw new ForbiddenException('Permission denied');
    const allowed = await this.authorization.hasPermissions({
      tenantId: auth.tenantId, accountId: auth.accountId, membershipId: auth.activeMembershipId,
    }, [permission], { kind: 'school', schoolId });
    if (!allowed) throw new ForbiddenException('Permission denied');
    return { tenantId: auth.tenantId, schoolId };
  }

  @Get('setup')
  async setup(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string) {
    const scope = await this.scope(request, schoolId, 'school.read');
    try { return await withTenantContext(this.database.db, scope.tenantId, (tx) => readAcademicSetup(tx, scope)); }
    catch (error) { return mapError(error); }
  }

  @Get('staff')
  async staff(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string) {
    const scope = await this.scope(request, schoolId, 'school.read');
    return withTenantContext(this.database.db, scope.tenantId, (tx) => this.people.listAssignableTeachers(tx, scope));
  }

  @Post('sessions')
  async session(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Body() body: unknown) {
    const scope = await this.scope(request, schoolId, 'school.manage');
    const input = parse(sessionInput, body);
    try { return await withTenantContext(this.database.db, scope.tenantId, (tx) => createAcademicSession(tx, scope, input)); }
    catch (error) { return mapError(error); }
  }

  @Post('sessions/:sessionId/classes')
  async academicClass(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('sessionId') sessionIdValue: string, @Body() body: unknown) {
    const scope = await this.scope(request, schoolId, 'school.manage');
    const sessionId = parse(uuid, sessionIdValue);
    const input = parse(classInput, body);
    try { return await withTenantContext(this.database.db, scope.tenantId, (tx) => createAcademicClass(tx, scope, sessionId, input)); }
    catch (error) { return mapError(error); }
  }

  @Post('sessions/:sessionId/subjects')
  async subject(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('sessionId') sessionIdValue: string, @Body() body: unknown) {
    const scope = await this.scope(request, schoolId, 'school.manage');
    const sessionId = parse(uuid, sessionIdValue);
    const input = parse(named, body);
    try { return await withTenantContext(this.database.db, scope.tenantId, (tx) => createAcademicSubject(tx, scope, sessionId, input)); }
    catch (error) { return mapError(error); }
  }

  @Post('classes/:classId/sections')
  async section(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('classId') classIdValue: string, @Body() body: unknown) {
    const scope = await this.scope(request, schoolId, 'school.manage');
    const classId = parse(uuid, classIdValue);
    const input = parse(sectionInput, body);
    try { return await withTenantContext(this.database.db, scope.tenantId, (tx) => createAcademicSection(tx, scope, classId, input)); }
    catch (error) { return mapError(error); }
  }

  @Post('sections/:sectionId/assignments')
  async assignment(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('sectionId') sectionIdValue: string, @Body() body: unknown) {
    const scope = await this.scope(request, schoolId, 'school.manage');
    const sectionId = parse(uuid, sectionIdValue);
    const input = parse(assignmentInput, body);
    try { return await withTenantContext(this.database.db, scope.tenantId, async (tx) => {
      const created = await createAcademicAssignment(tx, scope, sectionId, input);
      if (!await this.people.canAssignTeacher(tx, scope, input.membershipId)) {
        throw new BadRequestException('Link an active teacher profile at this school before assigning this account');
      }
      return created;
    }); }
    catch (error) { return mapError(error); }
  }

  @Post('sessions/:sessionId/activate')
  async activate(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('sessionId') sessionIdValue: string) {
    const scope = await this.scope(request, schoolId, 'school.manage');
    const sessionId = parse(uuid, sessionIdValue);
    try { return await withTenantContext(this.database.db, scope.tenantId, (tx) => activateAcademicSession(tx, scope, sessionId)); }
    catch (error) { return mapError(error); }
  }
}

@ApiTags('Academics')
@Controller('academics')
@UseGuards(AuthGuard)
export class AcademicSchoolsController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  @Get('schools')
  async list(@Req() request: AuthenticatedRequest) {
    const auth = request.auth;
    if (!auth?.tenantId || !auth.accountId || !auth.activeMembershipId) throw new ForbiddenException('Permission denied');
    const tenantId = auth.tenantId;
    const candidates = await withTenantContext(this.database.db, tenantId, (tx) => listAcademicSchools(tx, tenantId));
    const allowed = await Promise.all(candidates.map(async (school) => ({ school, allowed: await this.authorization.hasPermissions({
      tenantId, accountId: auth.accountId, membershipId: auth.activeMembershipId,
    }, ['school.read'], { kind: 'school', schoolId: school.id }) })));
    return allowed.filter((item) => item.allowed).map((item) => item.school);
  }
}
