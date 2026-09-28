import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AcademicSetupError, AttendanceError } from '@classloom/db';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { studentPeopleActor } from '../enrollment/student-directory.controller.js';
import { AttendanceService } from './attendance.service.js';

const uuid = z.string().uuid();
const registerQuery = z.object({ date: z.iso.date(), sectionId: uuid }).strict();
const entryInput = z.object({ academicEnrollmentId: uuid, status: z.enum(['present', 'absent', 'late', 'excused']) }).strict();
const saveInput = z.object({ entries: z.array(entryInput).min(1).max(5000) }).strict().superRefine((value, context) => {
  const ids = value.entries.map((entry) => entry.academicEnrollmentId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['entries'], message: 'Each student may appear only once' });
});

function mapAttendanceError(error: unknown): never {
  if (error instanceof AttendanceError || error instanceof AcademicSetupError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  const pgCode = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === '23505') throw new ConflictException('The attendance register changed. Refresh and try again');
  if (pgCode === '23503') throw new BadRequestException('A related student or academic record is no longer available');
  throw error;
}

@ApiTags('Attendance')
@Controller('attendance')
@UseGuards(AuthGuard, CsrfGuard)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Get('schools')
  async schools(@Req() request: AuthenticatedRequest) {
    return this.attendance.listSchools({ ...studentPeopleActor(request), requestId: request.requestId ?? '' });
  }

  @Get('schools/:schoolId/sessions')
  async sessions(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string) {
    const actor = { ...studentPeopleActor(request), requestId: request.requestId ?? '' };
    try { return await this.attendance.listSessions(actor, { tenantId: actor.tenantId, schoolId: parseRequest(uuid, schoolId) }); }
    catch (error) { return mapAttendanceError(error); }
  }

  @Get('schools/:schoolId/sessions/:sessionId/sections')
  async sections(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('sessionId') sessionValue: string) {
    const actor = { ...studentPeopleActor(request), requestId: request.requestId ?? '' };
    try { return await this.attendance.listSections(actor, {
      tenantId: actor.tenantId, schoolId: parseRequest(uuid, schoolValue),
    }, parseRequest(uuid, sessionValue)); }
    catch (error) { return mapAttendanceError(error); }
  }

  @Get('schools/:schoolId/sessions/:sessionId/register')
  async readRegister(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') schoolValue: string,
    @Param('sessionId') sessionValue: string,
    @Query() query: unknown,
  ) {
    const actor = { ...studentPeopleActor(request), requestId: request.requestId ?? '' };
    const schoolId = parseRequest(uuid, schoolValue);
    const sessionId = parseRequest(uuid, sessionValue);
    const filters = parseRequest(registerQuery, query);
    try { return await this.attendance.readRegister(actor, { tenantId: actor.tenantId, schoolId }, { sessionId, ...filters }); }
    catch (error) { return mapAttendanceError(error); }
  }

  @Put('schools/:schoolId/sessions/:sessionId/register')
  async saveRegister(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') schoolValue: string,
    @Param('sessionId') sessionValue: string,
    @Query() query: unknown,
    @Body() body: unknown,
  ) {
    const actor = { ...studentPeopleActor(request), requestId: request.requestId ?? '' };
    const schoolId = parseRequest(uuid, schoolValue);
    const sessionId = parseRequest(uuid, sessionValue);
    const filters = parseRequest(registerQuery, query);
    const input = parseRequest(saveInput, body);
    try { return await this.attendance.saveRegister(actor, { tenantId: actor.tenantId, schoolId }, { sessionId, ...filters }, input.entries); }
    catch (error) { return mapAttendanceError(error); }
  }

  @Get('schools/:schoolId/registers/:registerId/events')
  async events(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('registerId') registerValue: string) {
    const actor = { ...studentPeopleActor(request), requestId: request.requestId ?? '' };
    try { return await this.attendance.readHistory(actor, {
      tenantId: actor.tenantId, schoolId: parseRequest(uuid, schoolValue),
    }, parseRequest(uuid, registerValue)); }
    catch (error) { return mapAttendanceError(error); }
  }
}
