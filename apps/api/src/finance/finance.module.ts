import { Module } from '@nestjs/common';
import { AcademicsModule } from '../academics/academics.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { EnrollmentModule } from '../enrollment/enrollment.module.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule, EnrollmentModule, AcademicsModule],
  controllers: [FinanceController],
  providers: [FinanceService],
})
export class FinanceModule {}
