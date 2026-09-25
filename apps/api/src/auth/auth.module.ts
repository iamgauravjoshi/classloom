import { Module } from '@nestjs/common';
import { parseRuntimeEnv } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthRepository } from './auth.repository.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { EmailService } from './email.service.js';
import { IdentityFlowService } from './identity-flow.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, useFactory: () => parseRuntimeEnv() },
    AuthRepository,
    AuthService,
    IdentityFlowService,
    EmailService,
    AuthGuard,
    CsrfGuard,
    TokenService,
    {
      provide: PasswordService,
      useFactory: () => new PasswordService(parseRuntimeEnv().argon2),
    },
  ],
  exports: [AuthService, AuthRepository, PasswordService, TokenService, IdentityFlowService, AuthGuard],
})
export class AuthModule {}

