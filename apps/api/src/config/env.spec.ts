import { parseEnv, parseRuntimeEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgresql://classloom:secret@localhost:5432/classloom',
  API_PORT: '4000',
  WEB_ORIGIN: 'http://localhost:3000',
};

const validProduction = {
  ...valid,
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://app.classloom.example',
  SMTP_HOST: 'smtp.classloom.example',
  SMTP_PORT: '587',
  SMTP_TLS_MODE: 'starttls',
  SMTP_FROM: 'ClassLoom <no-reply@classloom.example>',
  SMTP_USERNAME: 'smtp-user',
  SMTP_PASSWORD: 'smtp-password',
  AUTH_RATE_LIMIT_KEY: 'production-key-with-at-least-thirty-two-characters',
};

describe('parseEnv', () => {
  it('accepts a complete development configuration', () => {
    expect(parseEnv(valid)).toMatchObject({
      databaseUrl: valid.DATABASE_URL,
      apiPort: 4000,
      trustedProxyHops: 0,
      webOrigin: valid.WEB_ORIGIN,
    });
  });

  it('rejects a missing database URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects an out-of-range port', () => {
    expect(() => parseEnv({ ...valid, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('uses explicit development defaults for cookies and authentication lifetimes', () => {
    expect(parseEnv(valid)).toMatchObject({
      environment: 'development',
      cookieSecure: false,
      cookieName: 'classloom_session',
      sessionIdleTtlSeconds: 43_200,
      sessionAbsoluteTtlSeconds: 604_800,
      invitationTtlSeconds: 604_800,
      passwordResetTtlSeconds: 3_600,
      smtp: { host: 'localhost', port: 1025, secure: false },
    });
  });

  it('requires production SMTP credentials, HTTPS origin, and secure cookies', () => {
    expect(parseEnv(validProduction)).toMatchObject({
      environment: 'production',
      cookieSecure: true,
      smtp: { host: 'smtp.classloom.example', port: 587, secure: false },
    });
    expect(() => parseEnv({ ...validProduction, SMTP_PASSWORD: undefined })).toThrow(/SMTP_PASSWORD/);
    expect(() => parseEnv({ ...validProduction, WEB_ORIGIN: 'http://app.classloom.example' })).toThrow(/WEB_ORIGIN/);
    expect(() => parseEnv({ ...validProduction, AUTH_COOKIE_SECURE: 'false' })).toThrow(/AUTH_COOKIE_SECURE/);
  });

  it('rejects invalid authentication lifetime, throttling, and Argon2 parameters', () => {
    expect(() => parseEnv({ ...valid, AUTH_SESSION_IDLE_TTL_SECONDS: '0' })).toThrow(/AUTH_SESSION_IDLE_TTL_SECONDS/);
    expect(() => parseEnv({ ...valid, AUTH_LOGIN_LIMIT: '-1' })).toThrow(/AUTH_LOGIN_LIMIT/);
    expect(() => parseEnv({ ...valid, ARGON2_MEMORY_KIB: '100' })).toThrow(/ARGON2_MEMORY_KIB/);
  });

  it('uses a connection placeholder only in test runtime configuration', () => {
    expect(parseRuntimeEnv({ NODE_ENV: 'test' }).databaseUrl).toBe('postgresql://localhost/classloom_test');
    expect(() => parseRuntimeEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });
});
