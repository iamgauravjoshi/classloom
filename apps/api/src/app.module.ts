import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { HttpExceptionEnvelopeFilter } from './common/http-exception.filter.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AuthorizationModule } from './authorization/authorization.module.js';
import { AcademicsModule } from './academics/academics.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, AuthorizationModule, AcademicsModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionEnvelopeFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}

