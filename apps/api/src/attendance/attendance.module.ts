import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { EnrollmentModule } from '../enrollment/enrollment.module.js';
import { PeopleModule } from '../people/people.module.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule, EnrollmentModule, AcademicsModule, PeopleModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
