import { Module } from '@nestjs/common';
import { AuthorizationController } from './authorization.controller.js';
import { listMembershipAuthorizationGrants } from '@classloom/db';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseService } from '../database/database.service.js';
import { AUTHORIZATION_GRANT_READER, AuthorizationService } from './authorization.service.js';
import { AuthorizationGuard } from './authorization.guard.js';

@Module({
  controllers: [AuthorizationController],
  imports: [AuthModule],
  providers: [
    {
      provide: AUTHORIZATION_GRANT_READER,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => ({
        listMembershipAuthorizationGrants: (context: { tenantId: string; accountId: string; membershipId: string }) =>
          listMembershipAuthorizationGrants(database.db, context),
      }),
    },
    AuthorizationService,
    AuthorizationGuard,
  ],
  exports: [AuthorizationService, AuthorizationGuard],
})
export class AuthorizationModule {}


