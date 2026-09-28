import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AcademicSetupError, EnrollmentError, FinanceError } from '@classloom/db';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { studentPeopleActor } from '../enrollment/student-directory.controller.js';
import { FinanceService, type FinanceUserActor } from './finance.service.js';

const uuid = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const amount = z.string().regex(/^[1-9]\d{0,14}$/, 'Enter a positive amount in minor currency units');
const reason = z.string().trim().min(3).max(500);
const headInput = z.object({ code: z.string().trim().min(1).max(32), name }).strict();
const planInput = z.object({ sessionId: uuid, classId: uuid, name }).strict();
const lineInput = z.object({ headId: uuid, label: name, dueDate: z.iso.date(), amountMinor: amount }).strict();
const assignInput = z.object({ schoolEnrollmentId: uuid }).strict();
const concessionInput = z.object({ schoolEnrollmentId: uuid, chargeId: uuid, amountMinor: amount, reason }).strict();
const allocation = z.object({ chargeId: uuid, amountMinor: amount }).strict();
const paymentInput = z.object({ schoolEnrollmentId: uuid, idempotencyKey: z.string().uuid(),
  method: z.enum(['cash', 'bank_transfer', 'cheque', 'card_terminal', 'other']), reference: z.string().trim().max(120).nullable().optional(),
  allocations: z.array(allocation).min(1).max(100) }).strict();
const reverseInput = z.object({ reason }).strict();

function actor(request: AuthenticatedRequest): FinanceUserActor { return studentPeopleActor(request); }
function scope(request: AuthenticatedRequest, schoolId: string) { return { tenantId: actor(request).tenantId, schoolId: parseRequest(uuid, schoolId) }; }

function mapFinanceError(error: unknown): never {
  if (error instanceof FinanceError || error instanceof EnrollmentError || error instanceof AcademicSetupError) {
    if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException(error.message);
  }
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === '23505') throw new ConflictException('This finance record already exists. Refresh and try again');
  if (code === '23503') throw new BadRequestException('A related school, class, fee, or student record is unavailable');
  throw error;
}

@ApiTags('Finance')
@Controller('finance')
@UseGuards(AuthGuard, CsrfGuard)
export class FinanceController {
  constructor(@Inject(FinanceService) private readonly finance: FinanceService) {}

  @Get('schools')
  schools(@Req() request: AuthenticatedRequest) { return this.finance.schools(actor(request)); }

  @Get('schools/:schoolId/setup')
  async setup(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string) {
    try { return await this.finance.setup(actor(request), scope(request, schoolId)); } catch (error) { return mapFinanceError(error); }
  }

  @Get('schools/:schoolId/enrollments')
  async enrollments(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string) {
    try { return await this.finance.enrollments(actor(request), scope(request, schoolId)); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/heads')
  async head(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Body() body: unknown) {
    try { return await this.finance.head(actor(request), scope(request, schoolId), parseRequest(headInput, body)); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/plans')
  async plan(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Body() body: unknown) {
    try { return await this.finance.plan(actor(request), scope(request, schoolId), parseRequest(planInput, body)); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/plans/:planId/lines')
  async line(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('planId') planId: string, @Body() body: unknown) {
    try { return await this.finance.line(actor(request), scope(request, schoolId), parseRequest(uuid, planId), parseRequest(lineInput, body)); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/plans/:planId/assignments')
  async assign(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('planId') planId: string, @Body() body: unknown) {
    try { return await this.finance.assign(actor(request), scope(request, schoolId), parseRequest(uuid, planId), parseRequest(assignInput, body).schoolEnrollmentId); } catch (error) { return mapFinanceError(error); }
  }

  @Get('schools/:schoolId/statements/:schoolEnrollmentId')
  async statement(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('schoolEnrollmentId') enrollmentId: string) {
    try { return await this.finance.statement(actor(request), scope(request, schoolId), parseRequest(uuid, enrollmentId)); } catch (error) { return mapFinanceError(error); }
  }

  @Get('schools/:schoolId/outstanding')
  async outstanding(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string) {
    try { return await this.finance.outstanding(actor(request), scope(request, schoolId)); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/concessions')
  async concession(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Body() body: unknown) {
    const input = parseRequest(concessionInput, body);
    try { return await this.finance.concession(actor(request), scope(request, schoolId), input.schoolEnrollmentId, input.chargeId, input.amountMinor, input.reason); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/payments')
  async payment(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Body() body: unknown) {
    try { return await this.finance.payment(actor(request), scope(request, schoolId), parseRequest(paymentInput, body)); } catch (error) { return mapFinanceError(error); }
  }

  @Get('schools/:schoolId/payments/:paymentId')
  async receipt(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('paymentId') paymentId: string) {
    try { return await this.finance.receipt(actor(request), scope(request, schoolId), parseRequest(uuid, paymentId)); } catch (error) { return mapFinanceError(error); }
  }

  @Post('schools/:schoolId/payments/:paymentId/reversal')
  async reverse(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolId: string, @Param('paymentId') paymentId: string, @Body() body: unknown) {
    try { return await this.finance.reverse(actor(request), scope(request, schoolId), parseRequest(uuid, paymentId), parseRequest(reverseInput, body).reason); } catch (error) { return mapFinanceError(error); }
  }
}
