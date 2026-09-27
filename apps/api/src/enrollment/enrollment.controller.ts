import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  AcademicSetupError,
  EnrollmentError,
  listAcademicEnrollmentHistory,
  listStudentSchoolEnrollments,
  StudentPeopleError,
  withTenantContext,
} from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { studentPeopleActor } from './student-directory.controller.js';
import { EnrollmentService } from './enrollment.service.js';

const uuid = z.string().uuid();
const schoolEnrollmentInput = z.object({ admissionNumber: z.string().trim().min(1).max(40), admissionDate: z.iso.date() }).strict();
const academicEnrollmentInput = z.object({
  sessionId: uuid, classId: uuid, sectionId: uuid, rollNumber: z.string().trim().min(1).max(40).nullable().optional(), startDate: z.iso.date(),
}).strict();
const transferInput = z.object({
  sessionId: uuid, classId: uuid, sectionId: uuid, rollNumber: z.string().trim().min(1).max(40).nullable().optional(),
  effectiveDate: z.iso.date(), reason: z.string().trim().max(500).nullable().optional(),
}).strict();
const closeInput = z.object({ effectiveDate: z.iso.date(), reason: z.string().trim().max(500).nullable().optional() }).strict();
const optionalText = (maximum: number) => z.string().trim().max(maximum).nullable().optional();
const admissionInput = z.object({
  student: z.object({
    studentCode: z.string().trim().min(1).max(20), givenName: z.string().trim().min(2).max(120),
    middleName: optionalText(120), familyName: z.string().trim().min(2).max(120), preferredName: optionalText(120),
    dateOfBirth: z.iso.date(), gender: optionalText(50), email: optionalText(254), phone: optionalText(30),
  }).strict(),
  schoolEnrollment: schoolEnrollmentInput,
  academicEnrollment: academicEnrollmentInput,
  guardians: z.array(z.object({
    guardian: z.object({
      guardianCode: z.string().trim().min(1).max(20), givenName: z.string().trim().min(2).max(120),
      middleName: optionalText(120), familyName: z.string().trim().min(2).max(120), preferredName: optionalText(120),
      email: optionalText(254), phone: optionalText(30), occupation: optionalText(120),
      addressLine1: optionalText(240), addressLine2: optionalText(240), city: optionalText(120),
      state: optionalText(120), postalCode: optionalText(30), countryCode: optionalText(2),
    }).strict(),
    relationship: z.object({
      relationshipType: z.enum(['mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other']),
      primaryContact: z.boolean().optional(), emergencyContact: z.boolean().optional(), authorizedPickup: z.boolean().optional(),
      financialResponsibility: z.boolean().optional(), portalAccess: z.boolean().optional(),
    }).strict(),
  }).strict()).max(10).optional(),
}).strict();

function mapEnrollmentError(error: unknown): never {
  if (error instanceof EnrollmentError || error instanceof AcademicSetupError || error instanceof StudentPeopleError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  throw error;
}

@ApiTags('Enrollment')
@Controller('enrollment/schools/:schoolId')
@UseGuards(AuthGuard, CsrfGuard)
export class EnrollmentController {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService, @Inject(EnrollmentService) private readonly enrollment: EnrollmentService) {}

  @Post('admissions')
  async admit(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const input = parseRequest(admissionInput, body);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => this.enrollment.admitStudent(tx, actor, schoolId, input)); }
    catch (error) { return mapEnrollmentError(error); }
  }

  @Get('students/:studentId/school-enrollments')
  async schoolHistory(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    await this.enrollment.requireRead(actor, schoolId);
    return withTenantContext(this.database.db, actor.tenantId, (tx) => listStudentSchoolEnrollments(tx, { tenantId: actor.tenantId, schoolId }, studentId));
  }

  @Post('students/:studentId/school-enrollments')
  async createSchool(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('studentId') studentIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const studentId = parseRequest(uuid, studentIdValue);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => this.enrollment.createSchoolEnrollment(tx, actor, schoolId, studentId, parseRequest(schoolEnrollmentInput, body))); }
    catch (error) { return mapEnrollmentError(error); }
  }

  @Get('school-enrollments/:schoolEnrollmentId/academic-enrollments')
  async academicHistory(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('schoolEnrollmentId') schoolEnrollmentIdValue: string) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const schoolEnrollmentId = parseRequest(uuid, schoolEnrollmentIdValue);
    await this.enrollment.requireRead(actor, schoolId);
    return withTenantContext(this.database.db, actor.tenantId, (tx) => listAcademicEnrollmentHistory(tx, { tenantId: actor.tenantId, schoolId }, schoolEnrollmentId));
  }

  @Post('school-enrollments/:schoolEnrollmentId/academic-enrollments')
  async createAcademic(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('schoolEnrollmentId') schoolEnrollmentIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const schoolEnrollmentId = parseRequest(uuid, schoolEnrollmentIdValue);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => this.enrollment.createAcademicEnrollment(tx, actor, schoolId, schoolEnrollmentId, parseRequest(academicEnrollmentInput, body))); }
    catch (error) { return mapEnrollmentError(error); }
  }

  @Post('academic-enrollments/:enrollmentId/transfer')
  async transfer(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('enrollmentId') enrollmentIdValue: string, @Body() body: unknown) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const enrollmentId = parseRequest(uuid, enrollmentIdValue);
    const { effectiveDate, ...input } = parseRequest(transferInput, body);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => this.enrollment.transferAcademicEnrollment(tx, actor, schoolId, enrollmentId, { ...input, startDate: effectiveDate })); }
    catch (error) { return mapEnrollmentError(error); }
  }

  @Post('academic-enrollments/:enrollmentId/withdraw')
  async withdraw(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('enrollmentId') enrollmentIdValue: string, @Body() body: unknown) {
    return this.close(request, schoolIdValue, enrollmentIdValue, body, 'withdraw');
  }

  @Post('academic-enrollments/:enrollmentId/complete')
  async complete(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Param('enrollmentId') enrollmentIdValue: string, @Body() body: unknown) {
    return this.close(request, schoolIdValue, enrollmentIdValue, body, 'complete');
  }

  private async close(request: AuthenticatedRequest, schoolIdValue: string, enrollmentIdValue: string, body: unknown, action: 'withdraw' | 'complete') {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const enrollmentId = parseRequest(uuid, enrollmentIdValue);
    const input = parseRequest(closeInput, body);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) => action === 'withdraw'
      ? this.enrollment.withdrawAcademicEnrollment(tx, actor, schoolId, enrollmentId, input)
      : this.enrollment.completeAcademicEnrollment(tx, actor, schoolId, enrollmentId, input)); }
    catch (error) { return mapEnrollmentError(error); }
  }
}
