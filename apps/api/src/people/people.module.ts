import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AuthorizationModule } from '../authorization/authorization.module.js';
import { PeopleController, PeopleSchoolsController } from './people.controller.js';
import { PeopleService } from './people.service.js';
import { StudentPeopleService } from './student-people.service.js';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [PeopleSchoolsController, PeopleController],
  providers: [PeopleService, StudentPeopleService],
  exports: [PeopleService, StudentPeopleService],
})
export class PeopleModule {}
