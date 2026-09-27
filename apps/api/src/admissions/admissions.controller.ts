import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdmissionError, AcademicSetupError, EnrollmentError, StudentPeopleError, withTenantContext, type AdmissionTransitionAction } from '@classloom/db';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { studentPeopleActor } from '../enrollment/student-directory.controller.js';
import { AdmissionsService, type AdmissionsConversionRequest } from './admissions.service.js';

const uuid = z.string().uuid();
const text = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const caseInput = z.object({
  status: z.enum(['enquiry', 'draft']).optional(), studentGivenName: text(120), studentMiddleName: text(120),
  studentFamilyName: text(120), studentPreferredName: text(120), studentDateOfBirth: z.iso.date().nullable().optional(),
  studentGender: text(50), studentEmail: text(254), studentPhone: text(30), existingStudentId: uuid.nullable().optional(),
  requestedSessionId: uuid.nullable().optional(), requestedClassId: uuid.nullable().optional(), requestedSectionId: uuid.nullable().optional(),
  reviewNote: text(500), decisionNote: text(500), guardians: z.array(z.object({
    guardianProfileId: uuid.nullable().optional(), guardianCode: text(20), givenName: z.string().trim().min(2).max(120),
    middleName: text(120), familyName: z.string().trim().min(2).max(120), preferredName: text(120), email: text(254), phone: text(30),
    occupation: text(120), addressLine1: text(240), addressLine2: text(240), city: text(120), state: text(120), postalCode: text(30), countryCode: text(2),
    relationshipType: z.enum(['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other']),
    primaryContact: z.boolean().optional(), emergencyContact: z.boolean().optional(), authorizedPickup: z.boolean().optional(),
    financialResponsibility: z.boolean().optional(), portalAccess: z.boolean().optional(),
  }).strict()).max(10).optional(),
}).strict();
const patchInput = caseInput.omit({ status: true }).partial().strict().refine((value) => Object.keys(value).length > 0, { message: 'Choose application details to update' });
const listInput = z.object({
  q: z.string().trim().max(120).optional(), status: z.enum(['enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted']).optional(),
  requestedSessionId: uuid.optional(), createdFrom: z.iso.date().optional(), createdTo: z.iso.date().optional(),
  cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict().refine((value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo, { message: 'Start date must be on or before end date' });
const noteInput = z.object({ note: z.string().trim().min(1).max(500) }).strict();
const emptyInput = z.object({}).strict();
const conversionInput = z.object({
  existingStudentId: uuid.optional(), studentCode: z.string().trim().min(1).max(20).optional(),
  schoolEnrollment: z.object({ admissionNumber: z.string().trim().min(1).max(40), admissionDate: z.iso.date() }).strict(),
  academicEnrollment: z.object({ sessionId: uuid, classId: uuid, sectionId: uuid, rollNumber: z.string().trim().min(1).max(40).nullable().optional(), startDate: z.iso.date() }).strict(),
  guardianCodes: z.array(z.string().trim().min(1).max(20)).max(10).optional(),
}).strict().refine((value) => !(value.existingStudentId && value.studentCode), { message: 'Choose an existing student or provide a new student code' });

function mapAdmissionsError(error: unknown): never {
  if (error instanceof AdmissionError || error instanceof EnrollmentError || error instanceof AcademicSetupError || error instanceof StudentPeopleError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  const pgCode = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === '23505') throw new ConflictException('An admission, student, guardian, or enrollment with these details already exists');
  if (pgCode === '23503') throw new BadRequestException('A related record was not found in this school');
  throw error;
}

@ApiTags('Admissions')
@Controller('admissions')
@UseGuards(AuthGuard, CsrfGuard)
export class AdmissionsController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(AdmissionsService) private readonly admissions: AdmissionsService) {}

  @Get('schools')
  schools(@Req() request: AuthenticatedRequest) {
    const actor = studentPeopleActor(request);
    return withTenantContext(this.database.db, actor.tenantId, (tx) => this.admissions.listSchools(tx, actor));
  }

  @Get('schools/:schoolId/cases')
  list(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Query() query: unknown) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const filters = parseRequest(listInput, query);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.list(tx, actor, schoolId, filters); } catch (error) { return mapAdmissionsError(error); }
    });
  }

  @Post('schools/:schoolId/cases')
  create(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const input = parseRequest(caseInput, body);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.create(tx, actor, schoolId, input); } catch (error) { return mapAdmissionsError(error); }
    });
  }

  @Get('schools/:schoolId/cases/:caseId')
  get(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const caseId = parseRequest(uuid, caseValue);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.get(tx, actor, schoolId, caseId); } catch (error) { return mapAdmissionsError(error); }
    });
  }

  @Patch('schools/:schoolId/cases/:caseId')
  update(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const caseId = parseRequest(uuid, caseValue); const input = parseRequest(patchInput, body);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.update(tx, actor, schoolId, caseId, input); } catch (error) { return mapAdmissionsError(error); }
    });
  }

  @Get('schools/:schoolId/cases/:caseId/events')
  events(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const caseId = parseRequest(uuid, caseValue);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.events(tx, actor, schoolId, caseId); } catch (error) { return mapAdmissionsError(error); }
    });
  }

  @Post('schools/:schoolId/cases/:caseId/draft')
  draft(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    parseRequest(emptyInput, body); return this.transition(request, schoolValue, caseValue, 'draft');
  }

  @Post('schools/:schoolId/cases/:caseId/submit')
  submit(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    parseRequest(emptyInput, body); return this.transition(request, schoolValue, caseValue, 'submit');
  }

  @Post('schools/:schoolId/cases/:caseId/review')
  review(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    const parsed = parseRequest(z.discriminatedUnion('action', [z.object({ action: z.literal('start_review') }).strict(), z.object({ action: z.literal('return_to_draft'), note: z.string().trim().min(1).max(500) }).strict()]), body);
    return this.transition(request, schoolValue, caseValue, parsed.action, 'note' in parsed ? parsed.note : undefined);
  }

  @Post('schools/:schoolId/cases/:caseId/decision')
  decision(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    const parsed = parseRequest(z.object({ action: z.enum(['accept', 'reject']), note: z.string().trim().min(1).max(500) }).strict(), body);
    return this.transition(request, schoolValue, caseValue, parsed.action, parsed.note);
  }

  @Post('schools/:schoolId/cases/:caseId/withdraw')
  withdraw(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    const { note } = parseRequest(noteInput, body); return this.transition(request, schoolValue, caseValue, 'withdraw', note);
  }

  @Post('schools/:schoolId/cases/:caseId/admit')
  admit(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolValue: string, @Param('caseId') caseValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const caseId = parseRequest(uuid, caseValue); const input: AdmissionsConversionRequest = parseRequest(conversionInput, body);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.admit(tx, actor, schoolId, caseId, input); } catch (error) { return mapAdmissionsError(error); }
    });
  }

  private transition(request: AuthenticatedRequest, schoolValue: string, caseValue: string, action: Exclude<AdmissionTransitionAction, 'admit'>, note?: string) {
    const actor = studentPeopleActor(request); const schoolId = parseRequest(uuid, schoolValue); const caseId = parseRequest(uuid, caseValue);
    return withTenantContext(this.database.db, actor.tenantId, async (tx) => {
      try { return await this.admissions.transition(tx, actor, schoolId, caseId, action, note); } catch (error) { return mapAdmissionsError(error); }
    });
  }
}
