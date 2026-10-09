import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ResultsError,
  ExaminationError,
  AcademicSetupError,
} from '@classloom/db';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { parseRequest } from '../common/request-validation.js';
import { studentPeopleActor } from '../enrollment/student-directory.controller.js';
import { ResultsService } from './results.service.js';
import { reportCardPdf } from './report-card-pdf.js';
const uuid = z.string().uuid(),
  version = z.number().int().min(0),
  percent = z.number().int().min(0).max(10000);
const policy = z
  .object({
    name: z.string().trim().min(1).max(120),
    bands: z
      .array(
        z
          .object({
            grade: z.string().trim().min(1).max(24),
            minimumPercentage: percent,
          })
          .strict(),
      )
      .min(2)
      .max(20),
    overallPassingPercentage: percent,
    requireSubjectPass: z.boolean(),
    idempotencyKey: uuid,
  })
  .strict();
const generate = z
  .object({ examId: uuid, gradingPolicyId: uuid, idempotencyKey: uuid })
  .strict();
const expected = z.object({ expectedVersion: version }).strict();
const lifecycle = z
  .object({
    expectedVersion: version,
    action: z.enum(['submit', 'return', 'approve', 'publish', 'withdraw']),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();
const remarks = z
  .object({
    expectedVersion: version,
    remarks: z.string().max(1000).nullable(),
  })
  .strict();
const actor = (r: AuthenticatedRequest) => ({
  ...studentPeopleActor(r),
  requestId: r.requestId ?? '',
});
export async function resultsResponse<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof ResultsError ||
      error instanceof ExaminationError ||
      error instanceof AcademicSetupError
    ) {
      if (error.code === 'NOT_FOUND')
        throw new NotFoundException(error.message);
      if (error.code === 'CONFLICT') throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
    const code =
      (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code === '23505')
      throw new ConflictException(
        'This result request already exists. Refresh before retrying',
      );
    if (code === '23503')
      throw new BadRequestException(
        'A related school, enrollment, or staff record is unavailable',
      );
    if (code === '23514')
      throw new BadRequestException(
        'This report edition cannot be changed in its current state',
      );
    throw error;
  }
}
@Injectable()
export class ResultsPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>();
    response.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return next.handle();
  }
}
@ApiTags('Results')
@Controller('results')
@UseGuards(AuthGuard, CsrfGuard)
@UseInterceptors(ResultsPrivacyInterceptor)
export class ResultsController {
  constructor(
    @Inject(ResultsService) private readonly results: ResultsService,
  ) {}
  @Get('access') access(@Req() r: AuthenticatedRequest) {
    return resultsResponse(() => this.results.access(actor(r)));
  }
  @Get('schools/:schoolId/setup') setup(
    @Req() r: AuthenticatedRequest,
    @Param('schoolId') s: string,
  ) {
    return resultsResponse(() =>
      this.results.setup(actor(r), parseRequest(uuid, s)),
    );
  }
  @Post('schools/:schoolId/policies') policy(
    @Req() r: AuthenticatedRequest,
    @Param('schoolId') s: string,
    @Body() b: unknown,
  ) {
    return resultsResponse(() =>
      this.results.policy(
        actor(r),
        parseRequest(uuid, s),
        parseRequest(policy, b),
      ),
    );
  }
  @Post('schools/:schoolId/batches') generate(
    @Req() r: AuthenticatedRequest,
    @Param('schoolId') s: string,
    @Body() b: unknown,
  ) {
    return resultsResponse(() =>
      this.results.generate(
        actor(r),
        parseRequest(uuid, s),
        parseRequest(generate, b),
      ),
    );
  }
  @Get('schools/:schoolId/batches/:batchId') batch(
    @Req() r: AuthenticatedRequest,
    @Param('schoolId') s: string,
    @Param('batchId') id: string,
  ) {
    return resultsResponse(() =>
      this.results.batch(
        actor(r),
        parseRequest(uuid, s),
        parseRequest(uuid, id),
      ),
    );
  }
  @Post('schools/:schoolId/batches/:batchId/recalculate') recalculate(
    @Req() r: AuthenticatedRequest,
    @Param('schoolId') s: string,
    @Param('batchId') id: string,
    @Body() b: unknown,
  ) {
    const input = parseRequest(expected, b);
    return resultsResponse(() =>
      this.results.recalculate(
        actor(r),
        parseRequest(uuid, s),
        parseRequest(uuid, id),
        input.expectedVersion,
      ),
    );
  }
  @Post('schools/:schoolId/batches/:batchId/lifecycle') lifecycle(
    @Req() r: AuthenticatedRequest,
    @Param('schoolId') s: string,
    @Param('batchId') id: string,
    @Body() b: unknown,
  ) {
    const input = parseRequest(lifecycle, b);
    return resultsResponse(() =>
      this.results.lifecycle(
        actor(r),
        parseRequest(uuid, s),
        parseRequest(uuid, id),
        input.expectedVersion,
        input.action,
        input.reason,
      ),
    );
  }
  @Get('my-report-cards') personal(@Req() r: AuthenticatedRequest) {
    return resultsResponse(() => this.results.personal(actor(r)));
  }
  @Get('reports/:reportId') report(
    @Req() r: AuthenticatedRequest,
    @Param('reportId') id: string,
  ) {
    return resultsResponse(() =>
      this.results.report(actor(r), parseRequest(uuid, id)),
    );
  }
  @Put('reports/:reportId/remarks') remarks(
    @Req() r: AuthenticatedRequest,
    @Param('reportId') id: string,
    @Body() b: unknown,
  ) {
    const input = parseRequest(remarks, b);
    return resultsResponse(() =>
      this.results.remarks(
        actor(r),
        parseRequest(uuid, id),
        input.expectedVersion,
        input.remarks,
      ),
    );
  }
  @Get('reports/:reportId/pdf') async pdf(
    @Req() r: AuthenticatedRequest,
    @Param('reportId') id: string,
    @Res() response: Response,
  ) {
    const data = await resultsResponse(() =>
      this.results.report(actor(r), parseRequest(uuid, id), true),
    );
    const bytes = await reportCardPdf(data.report, data.batch);
    response
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-card-${data.report.id}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(bytes);
  }
}
