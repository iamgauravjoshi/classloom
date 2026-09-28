import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule, AcademicsModule],
  controllers: [TimetableController],
  providers: [TimetableService],
})
export class TimetableModule {}
