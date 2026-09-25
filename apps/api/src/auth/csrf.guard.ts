import { CanActivate, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthConfiguration } from './auth.service.js';
import { AUTH_CONFIG } from './auth.constants.js';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfiguration) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ method: string; headers: Record<string, string | string[] | undefined> }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return true;

    const originHeader = request.headers.origin;
    let origin: string | null = null;
    if (typeof originHeader === 'string') {
      origin = originHeader;
    } else {
      const referer = request.headers.referer;
      if (typeof referer === 'string') {
        try {
          origin = new URL(referer).origin;
        } catch {
          origin = null;
        }
      }
    }

    const applicationHeader = request.headers['x-classloom-request'];
    if (origin !== this.config.webOrigin || applicationHeader !== '1') {
      throw new ForbiddenException('Request origin could not be verified');
    }
    return true;
  }
}
