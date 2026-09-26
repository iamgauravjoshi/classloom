import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PeopleModule } from '../people/people.module.js';
import { EnrollmentService } from './enrollment.service.js';
import { EnrollmentController } from './enrollment.controller.js';
import { GuardianDirectoryController, StudentGuardianRelationshipController } from './guardian-directory.controller.js';
import { StudentDirectoryController } from './student-directory.controller.js';
import { StudentImportService } from './student-import.service.js';
import { StudentImportController } from './student-import.controller.js';

@Module({
  imports: [AuthModule, AuthorizationModule, PeopleModule, AcademicsModule],
  controllers: [
    StudentDirectoryController,
    GuardianDirectoryController,
    StudentGuardianRelationshipController,
    EnrollmentController,
    StudentImportController,
  ],
  providers: [EnrollmentService, StudentImportService],
  exports: [EnrollmentService, StudentImportService],
})
export class EnrollmentModule {}
