import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/env.js';
import { CsrfGuard } from './csrf.guard.js';

const guard = new CsrfGuard(parseEnv({ DATABASE_URL: 'postgresql://localhost/test' }));

function context(headers: Record<string, string | undefined>, method = 'POST') {
  const request = { method, headers };
  return {
    request,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('CsrfGuard', () => {
  it('allows state-changing requests from the configured origin with the application header', () => {
    expect(guard.canActivate(context({
      origin: 'http://localhost:3000',
      'x-classloom-request': '1',
    }))).toBe(true);
  });

  it('rejects untrusted origins, missing origins, and missing application headers', () => {
    for (const headers of [
      { origin: 'https://attacker.example', 'x-classloom-request': '1' },
      { 'x-classloom-request': '1' },
      { origin: 'http://localhost:3000' },
    ]) {
      expect(() => guard.canActivate(context(headers))).toThrow(ForbiddenException);
    }
  });

  it('accepts a matching Referer when Origin is absent and ignores safe methods', () => {
    expect(guard.canActivate(context({
      referer: 'http://localhost:3000/login',
      'x-classloom-request': '1',
    }))).toBe(true);
    expect(guard.canActivate(context({}, 'GET'))).toBe(true);
  });
});
