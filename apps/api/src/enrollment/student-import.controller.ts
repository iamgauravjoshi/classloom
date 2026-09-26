import { BadRequestException, Body, ConflictException, Controller, Headers, Inject, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import {
  AcademicSetupError,
  EnrollmentError,
  StudentImportBatchError,
  StudentPeopleError,
  withTenantContext,
} from '@classloom/db';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CsrfGuard } from '../auth/csrf.guard.js';
import { parseRequest } from '../common/request-validation.js';
import { DatabaseService } from '../database/database.service.js';
import { studentPeopleActor } from './student-directory.controller.js';
import { StudentImportService, StudentImportCommitError } from './student-import.service.js';
import { inspectStudentCsv, StudentImportFileError, STUDENT_CSV_MAX_BYTES, type StudentCsvMapping } from './student-import.js';

const uuid = z.string().uuid();
const fileInterceptor = FileInterceptor('file', { limits: { fileSize: STUDENT_CSV_MAX_BYTES, files: 1, fields: 1 } });

function requiredFile(file: Express.Multer.File | undefined): Buffer {
  if (!file?.buffer?.length) throw new BadRequestException('Choose a non-empty CSV file');
  return file.buffer;
}

function parseMapping(body: unknown): StudentCsvMapping {
  const fields = parseRequest(z.object({ mapping: z.string().min(2).max(10000) }).strict(), body);
  let value: unknown;
  try { value = JSON.parse(fields.mapping); }
  catch { throw new BadRequestException({ message: 'Column mapping must be valid JSON', details: { fields: { mapping: 'Column mapping must be valid JSON' } } }); }
  return parseRequest(z.record(z.string(), z.string().min(1)).refine((mapping) => Object.keys(mapping).length > 0, 'Choose CSV columns'), value) as StudentCsvMapping;
}

function mapImportError(error: unknown): never {
  if (error instanceof StudentImportCommitError) {
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    throw new BadRequestException({ message: error.message, details: { rows: error.errors } });
  }
  if (error instanceof StudentImportFileError) throw new BadRequestException(error.message);
  if (error instanceof StudentImportBatchError || error instanceof EnrollmentError || error instanceof AcademicSetupError || error instanceof StudentPeopleError) {
    if (error.code === 'CONFLICT') throw new ConflictException(error.message);
    if (error.code === 'NOT_FOUND') throw new BadRequestException(error.message);
    throw new BadRequestException(error.message);
  }
  throw error;
}

@ApiTags('Student Import')
@Controller('enrollment/schools/:schoolId/imports/students')
@UseGuards(AuthGuard, CsrfGuard)
export class StudentImportController {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StudentImportService) private readonly imports: StudentImportService,
  ) {}

  @Post('inspect')
  @UseInterceptors(fileInterceptor)
  async inspect(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @UploadedFile() file?: Express.Multer.File) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.imports.requireCommit(actor, schoolId);
    try { return inspectStudentCsv(requiredFile(file)); }
    catch (error) { return mapImportError(error); }
  }

  @Post('preview')
  @UseInterceptors(fileInterceptor)
  async preview(@Req() request: AuthenticatedRequest, @Param('schoolId') schoolIdValue: string, @Body() body: unknown, @UploadedFile() file?: Express.Multer.File) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    await this.imports.requireCommit(actor, schoolId);
    try { return await withTenantContext(this.database.db, actor.tenantId, (tx) =>
      this.imports.previewInContext(tx, actor, schoolId, requiredFile(file), parseMapping(body))); }
    catch (error) { return mapImportError(error); }
  }

  @Post('commit')
  @UseInterceptors(fileInterceptor)
  async commit(
    @Req() request: AuthenticatedRequest,
    @Param('schoolId') schoolIdValue: string,
    @Headers('idempotency-key') idempotencyKeyValue: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const actor = studentPeopleActor(request);
    const schoolId = parseRequest(uuid, schoolIdValue);
    const idempotencyKey = parseRequest(z.string().trim().min(1).max(200), idempotencyKeyValue);
    const bytes = requiredFile(file);
    const mapping = parseMapping(body);
    try {
      return await withTenantContext(this.database.db, actor.tenantId, (tx) =>
        this.imports.commit(tx, actor, schoolId, bytes, mapping, idempotencyKey));
    } catch (error) { return mapImportError(error); }
  }
}
