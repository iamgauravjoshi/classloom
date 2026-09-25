import { CanActivate, Injectable, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthConfiguration } from './auth.service.js';
import { AUTH_CONFIG } from './auth.constants.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { readSessionCookie } from './session-cookie.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(request.headers.cookie, this.config.cookieName);
    if (!token) throw new UnauthorizedException('Authentication required');
    request.auth = await this.authService.authenticate(token);
    return true;
  }
}
