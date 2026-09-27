import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { EnrollmentModule } from '../enrollment/enrollment.module.js';
import { PeopleModule } from '../people/people.module.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule, PeopleModule, AcademicsModule, EnrollmentModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}
