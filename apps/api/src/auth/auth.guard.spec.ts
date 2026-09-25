import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env.js';
import { AuthService } from './auth.service.js';
import { AuthGuard } from './auth.guard.js';

function context(headers: Record<string, string | undefined>) {
  const request = { headers };
  return {
    request,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('AuthGuard', () => {
  it('resolves the host cookie and attaches a trusted session principal', async () => {
    const principal = {
      accountId: 'account-id', email: 'user@example.test', displayName: null,
      sessionId: 'session-id', activeMembershipId: null, tenantId: null,
    };
    const authenticate = vi.fn().mockResolvedValue(principal);
    const authService = { authenticate } as unknown as AuthService;
    const guard = new AuthGuard(authService, parseEnv({ DATABASE_URL: 'postgresql://localhost/test' }));
    const ctx = context({ cookie: 'other=x; classloom_session=opaque-token' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(authenticate).toHaveBeenCalledWith('opaque-token');
    expect((ctx as unknown as { request: { auth: typeof principal } }).request.auth).toEqual(principal);
  });

  it('rejects a missing or malformed session cookie', async () => {
    const authenticate = vi.fn();
    const authService = { authenticate } as unknown as AuthService;
    const guard = new AuthGuard(authService, parseEnv({ DATABASE_URL: 'postgresql://localhost/test' }));

    await expect(guard.canActivate(context({}))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(context({ cookie: 'classloom_session=%ZZ' })))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
