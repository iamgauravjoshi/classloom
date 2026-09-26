import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PeopleModule } from '../people/people.module.js';
import { EnrollmentService } from './enrollment.service.js';

@Module({
  imports: [AuthorizationModule, PeopleModule, AcademicsModule],
  providers: [EnrollmentService],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
