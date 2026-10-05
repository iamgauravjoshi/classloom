import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AcademicsModule } from '../academics/academics.module.js';
import { EnrollmentModule } from '../enrollment/enrollment.module.js';
import { PeopleModule } from '../people/people.module.js';
import { ExaminationsService } from './examinations.service.js';
import { ExaminationsController } from './examinations.controller.js';
@Module({ imports: [AuthModule, AuthorizationModule, AcademicsModule, EnrollmentModule, PeopleModule], controllers: [ExaminationsController], providers: [ExaminationsService], exports: [ExaminationsService] })
export class ExaminationsModule {}
