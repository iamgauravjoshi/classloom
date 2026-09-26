import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AcademicSchoolsController, AcademicsController } from './academics.controller.js';
import { PeopleModule } from '../people/people.module.js';

@Module({ imports: [AuthModule, AuthorizationModule, PeopleModule], controllers: [AcademicSchoolsController, AcademicsController] })
export class AcademicsModule {}
