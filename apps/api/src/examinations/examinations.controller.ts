import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AcademicSetupError, ExaminationError } from '@classloom/db';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { parseRequest } from '../common/request-validation.js';
import { studentPeopleActor } from '../enrollment/student-directory.controller.js';
import { ExaminationsService } from './examinations.service.js';

const uuid = z.string().uuid(), version = z.number().int().min(0), text = z.string().trim().min(1).max(120), reason = z.string().trim().min(1, 'Enter a reason for this action').max(1000);
const examInput = z.object({ sessionId: uuid, classId: uuid, name: text, startDate: z.iso.date(), endDate: z.iso.date() }).strict();
const assessmentInput = z.object({ expectedVersion: version, sectionId: uuid, subjectId: uuid, label: text, assessmentDate: z.iso.date(), maximumScore: z.number().int().min(1).max(100000), passingScore: z.number().int().min(0).max(100000) }).strict();
const mark = z.object({ status: z.enum(['unmarked', 'scored', 'absent', 'exempt']), score: z.number().int().min(0).max(100000).nullable() });
const saveInput = z.object({ expectedVersion: version, entries: z.array(mark.extend({ markId: uuid }).strict()).min(1).max(5000) }).strict();
const lifecycle = z.object({ expectedVersion: version, action: z.enum(['open', 'complete']) }).strict();
const review = z.object({ expectedVersion: version, action: z.enum(['submit', 'return', 'lock']), reason: reason.optional() }).strict();
const correction = mark.extend({ expectedVersion: version, markId: uuid, reason }).strict();
const decision = z.object({ expectedVersion: version, correctionId: uuid, decision: z.enum(['approve', 'reject']), reason }).strict();
export async function examinationResponse<T>(work: () => Promise<T>): Promise<T> {
  try { return await work(); } catch (error) {
    if (error instanceof ExaminationError || error instanceof AcademicSetupError) {
      if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
      if (error.code === 'CONFLICT') throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === '23505') throw new ConflictException('This examination item or pending correction already exists. Refresh before retrying');
    if (code === '23503') throw new BadRequestException('A related academic or enrollment record is unavailable');
    if (code === '23514') throw new BadRequestException('Check the examination dates, marks, and outcome values');
    throw error;
  }
}
const actor = (r: AuthenticatedRequest) => ({ ...studentPeopleActor(r), requestId: r.requestId ?? '' });
@ApiTags('Examinations')
@Controller('examinations')
@UseGuards(AuthGuard, CsrfGuard)
export class ExaminationsController {
  constructor(@Inject(ExaminationsService) private readonly exams: ExaminationsService) {}
  @Get('schools') schools(@Req() r: AuthenticatedRequest) { return examinationResponse(() => this.exams.schools(actor(r))); }
  @Get('schools/:schoolId/setup') setup(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string) { return examinationResponse(() => this.exams.setup(actor(r), parseRequest(uuid, s))); }
  @Post('schools/:schoolId/exams') create(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Body() body: unknown) { return examinationResponse(() => this.exams.create(actor(r), parseRequest(uuid, s), parseRequest(examInput, body))); }
  @Post('schools/:schoolId/exams/:examId/assessments') add(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('examId') id: string, @Body() body: unknown) { return examinationResponse(() => this.exams.add(actor(r), parseRequest(uuid, s), parseRequest(uuid, id), parseRequest(assessmentInput, body))); }
  @Post('schools/:schoolId/exams/:examId/lifecycle') lifecycle(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('examId') id: string, @Body() body: unknown) { const input = parseRequest(lifecycle, body); return examinationResponse(() => this.exams.lifecycle(actor(r), parseRequest(uuid, s), parseRequest(uuid, id), input.expectedVersion, input.action)); }
  @Get('schools/:schoolId/assessments/:assessmentId/sheet') sheet(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('assessmentId') id: string) { return examinationResponse(() => this.exams.sheet(actor(r), parseRequest(uuid, s), parseRequest(uuid, id))); }
  @Put('schools/:schoolId/assessments/:assessmentId/marks') save(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('assessmentId') id: string, @Body() body: unknown) { const input = parseRequest(saveInput, body); return examinationResponse(() => this.exams.save(actor(r), parseRequest(uuid, s), parseRequest(uuid, id), input.expectedVersion, input.entries)); }
  @Post('schools/:schoolId/assessments/:assessmentId/review') review(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('assessmentId') id: string, @Body() body: unknown) { const input = parseRequest(review, body); return examinationResponse(() => this.exams.transition(actor(r), parseRequest(uuid, s), parseRequest(uuid, id), input.expectedVersion, input.action, input.reason)); }
  @Post('schools/:schoolId/assessments/:assessmentId/corrections') correction(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('assessmentId') id: string, @Body() body: unknown) { const input = parseRequest(correction, body); return examinationResponse(() => this.exams.correction(actor(r), parseRequest(uuid, s), parseRequest(uuid, id), input.expectedVersion, input.markId, input)); }
  @Post('schools/:schoolId/assessments/:assessmentId/decisions') decision(@Req() r: AuthenticatedRequest, @Param('schoolId') s: string, @Param('assessmentId') id: string, @Body() body: unknown) { const input = parseRequest(decision, body); return examinationResponse(() => this.exams.decide(actor(r), parseRequest(uuid, s), parseRequest(uuid, id), input.expectedVersion, input.correctionId, input.decision, input.reason)); }
}
