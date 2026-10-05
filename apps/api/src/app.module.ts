import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { HttpExceptionEnvelopeFilter } from './common/http-exception.filter.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { AcademicsModule } from './academics/academics.module.js';
import { PeopleModule } from './people/people.module.js';
import { EnrollmentModule } from './enrollment/enrollment.module.js';
import { AdmissionsModule } from './admissions/admissions.module.js';
import { TimetableModule } from './timetable/timetable.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { ExaminationsModule } from './examinations/examinations.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule, AcademicsModule, PeopleModule, EnrollmentModule, AdmissionsModule, TimetableModule, AttendanceModule, FinanceModule, ExaminationsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionEnvelopeFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}

