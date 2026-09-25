import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { AcademicSchoolsController, AcademicsController } from './academics.controller.js';

@Module({ imports: [AuthModule, AuthorizationModule], controllers: [AcademicSchoolsController, AcademicsController] })
export class AcademicsModule {}
