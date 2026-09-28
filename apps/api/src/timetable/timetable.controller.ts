import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AcademicSetupError, TimetableError, listStaffSchools, withTenantContext } from '@classloom/db';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { studentPeopleActor } from '../enrollment/student-directory.controller.js';
import { TimetableService } from './timetable.service.js';

const uuid = z.string().uuid();
const filtersInput = z.object({ sectionId: uuid.optional(), teacherMembershipId: uuid.optional() }).strict();
const slotInput = z.object({
  sessionId: uuid,
  sectionId: uuid,
  subjectId: uuid,
  teacherAssignmentId: uuid.nullable().optional(),
  weekday: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time in HH:mm format'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time in HH:mm format'),
  roomLabel: z.string().trim().max(120).nullable().optional(),
}).strict();
const emptyInput = z.object({}).strict();

function mapTimetableError(error: unknown): never {
  if (error instanceof TimetableError || error instanceof AcademicSetupError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  const pgCode = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === '23505') throw new ConflictException('This timetable change conflicts with an existing record');
  if (pgCode === '23503') throw new BadRequestException('A related academic record was not found in this school');
  throw error;
}

@ApiTags('Timetable')
@Controller('timetable')
@UseGuards(AuthGuard, CsrfGuard)
export class TimetableController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
    @Inject(TimetableService) private readonly timetable: TimetableService,
  ) {}

  private async can(actor: ReturnType<typeof studentPeopleActor>, schoolId: string, permission: 'timetable.read' | 'timetable.manage') {
    return this.authorization.hasPermissions(actor, [permission], { kind: 'school', schoolId });
  }

  private async require(actor: ReturnType<typeof studentPeopleActor>, schoolId: string, permission: 'timetable.read' | 'timetable.manage') {
    if (!await this.can(actor, schoolId, permission)) throw new ForbiddenException('Timetable access is not allowed for this school');
  }

  @Get('schools')
  async schools(@Req() request: AuthenticatedRequest) {
    const actor = studentPeopleActor(request);
    const schools = await withTenantContext(this.database.db, actor.tenantId, (tx) => listStaffSchools(tx, actor.tenantId));
    const result = await Promise.all(schools.map(async (school) => {
      const [canReadTimetable, canManageTimetable] = await Promise.all([
        this.can(actor, school.id, 'timetable.read'), this.can(actor, school.id, 'timetable.manage'),
      ]);
      return { ...school, canReadTimetable, canManageTimetable };
    }));
    return result.filter((school) => school.canReadTimetable || school.canManageTimetable);
  }

  @Get('schools/:schoolId/sessions/:sessionId')
  async read(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') schoolValue: string,
    @Param('sessionId') sessionValue: string,
    @Query() query: unknown,
  ) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolValue);
    const sessionId = parseRequest(uuid, sessionValue);
    const filters = parseRequest(filtersInput, query);
    const scope = { tenantId: actor.tenantId, schoolId };
    const [canRead, canManage] = await Promise.all([this.can(actor, schoolId, 'timetable.read'), this.can(actor, schoolId, 'timetable.manage')]);
    if (!canRead && !canManage) throw new ForbiddenException('Timetable access is not allowed for this school');
    try {
      const result = await this.timetable.read(scope, sessionId, filters);
      if (!canManage && result.timetable?.status !== 'published') return { ...result, timetable: null, slots: [] };
      return result;
    } catch (error) { return mapTimetableError(error); }
  }

  @Post('schools/:schoolId/sessions/:sessionId/slots')
  async create(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') schoolValue: string,
    @Param('sessionId') sessionValue: string,
    @Body() body: unknown,
  ) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolValue);
    const sessionId = parseRequest(uuid, sessionValue);
    await this.require(actor, schoolId, 'timetable.manage');
    const input = parseRequest(slotInput, body);
    if (input.sessionId !== sessionId) throw new BadRequestException('The slot session must match the timetable session');
    try { return await this.timetable.createSlot(actor, { tenantId: actor.tenantId, schoolId }, input); }
    catch (error) { return mapTimetableError(error); }
  }

  @Patch('schools/:schoolId/slots/:slotId')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') schoolValue: string,
    @Param('slotId') slotValue: string,
    @Body() body: unknown,
  ) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolValue);
    const slotId = parseRequest(uuid, slotValue);
    await this.require(actor, schoolId, 'timetable.manage');
    const input = parseRequest(slotInput, body);
    try { return await this.timetable.updateSlot(actor, { tenantId: actor.tenantId, schoolId }, slotId, input); }
    catch (error) { return mapTimetableError(error); }
  }

  @Delete('schools/:schoolId/slots/:slotId')
  async delete(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('slotId') slotValue: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolValue);
    const slotId = parseRequest(uuid, slotValue);
    await this.require(actor, schoolId, 'timetable.manage');
    try { return await this.timetable.deleteSlot(actor, { tenantId: actor.tenantId, schoolId }, slotId); }
    catch (error) { return mapTimetableError(error); }
  }

  @Post('schools/:schoolId/sessions/:sessionId/publish')
  async publish(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('sessionId') sessionValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolValue);
    const sessionId = parseRequest(uuid, sessionValue);
    await this.require(actor, schoolId, 'timetable.manage');
    parseRequest(emptyInput, body);
    try { return await this.timetable.publish(actor, { tenantId: actor.tenantId, schoolId }, sessionId); }
    catch (error) { return mapTimetableError(error); }
  }
}
