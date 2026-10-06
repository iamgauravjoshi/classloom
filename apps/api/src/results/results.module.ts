import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { EnrollmentModule } from '../enrollment/enrollment.module.js';
import { PeopleModule } from '../people/people.module.js';
import { ExaminationsModule } from '../examinations/examinations.module.js';
import { ResultsService } from './results.service.js';
import {
  ResultsController,
  ResultsPrivacyInterceptor,
} from './results.controller.js';
@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    AcademicsModule,
    EnrollmentModule,
    PeopleModule,
    ExaminationsModule,
  ],
  controllers: [ResultsController],
  providers: [ResultsService, ResultsPrivacyInterceptor],
})
export class ResultsModule {}
