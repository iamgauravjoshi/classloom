import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { HealthController } from './health/health.controller.js';
import { RequestIdMiddleware } from './common/request-id.middleware.js';
import { HttpExceptionEnvelopeFilter } from './common/http-exception.filter.js';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionEnvelopeFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
