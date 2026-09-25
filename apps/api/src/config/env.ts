import { z } from 'zod';

const booleanValue = z.enum(['true', 'false']).transform((value) => value === 'true');

const schema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  AUTH_COOKIE_NAME: z.string().trim().min(1).default('classloom_session'),
  AUTH_COOKIE_SECURE: booleanValue.optional(),
  AUTH_SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(60).max(2_592_000).default(43_200),
  AUTH_SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().min(3_600).max(2_592_000).default(604_800),
  AUTH_INVITATION_TTL_SECONDS: z.coerce.number().int().min(3_600).max(2_592_000).default(604_800),
  AUTH_PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  AUTH_LOGIN_LIMIT: z.coerce.number().int().min(1).max(100).default(5),
  AUTH_LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  AUTH_INVITATION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  AUTH_INVITATION_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  AUTH_RESET_LIMIT: z.coerce.number().int().min(1).max(100).default(3),
  AUTH_RESET_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  AUTH_RATE_LIMIT_KEY: z.string().optional(),
  ARGON2_MEMORY_KIB: z.coerce.number().int().min(19_456).max(262_144).default(65_536),
  ARGON2_TIME_COST: z.coerce.number().int().min(2).max(10).default(3),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  SMTP_TLS_MODE: z.enum(['implicit', 'starttls', 'none']).default('none'),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().trim().min(1).optional(),
}).superRefine((config, context) => {
  const origin = new URL(config.WEB_ORIGIN);
  if (origin.pathname !== '/' || origin.search || origin.hash) {
    context.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'must be an origin without a path, query, or fragment' });
  }

  if (config.AUTH_SESSION_ABSOLUTE_TTL_SECONDS < config.AUTH_SESSION_IDLE_TTL_SECONDS) {
    context.addIssue({
      code: 'custom',
      path: ['AUTH_SESSION_ABSOLUTE_TTL_SECONDS'],
      message: 'must be greater than or equal to the idle timeout',
    });
  }

  if (config.NODE_ENV === 'production') {
    if (origin.protocol !== 'https:') {
      context.addIssue({ code: 'custom', path: ['WEB_ORIGIN'], message: 'must use HTTPS in production' });
    }
    if (config.AUTH_COOKIE_SECURE === false) {
      context.addIssue({ code: 'custom', path: ['AUTH_COOKIE_SECURE'], message: 'must be true in production' });
    }
    for (const [key, value] of [
      ['SMTP_HOST', config.SMTP_HOST],
      ['SMTP_PORT', config.SMTP_PORT],
      ['SMTP_USERNAME', config.SMTP_USERNAME],
      ['SMTP_PASSWORD', config.SMTP_PASSWORD],
      ['SMTP_FROM', config.SMTP_FROM],
      ['AUTH_RATE_LIMIT_KEY', config.AUTH_RATE_LIMIT_KEY],
    ] as const) {
      if (value === undefined || value === '') {
        context.addIssue({ code: 'custom', path: [key], message: 'is required in production' });
      }
    }
    if ((config.AUTH_RATE_LIMIT_KEY?.length ?? 0) < 32) {
      context.addIssue({ code: 'custom', path: ['AUTH_RATE_LIMIT_KEY'], message: 'must contain at least 32 characters' });
    }
    if (config.SMTP_TLS_MODE === 'none') {
      context.addIssue({ code: 'custom', path: ['SMTP_TLS_MODE'], message: 'must use implicit TLS or STARTTLS in production' });
    }
  }
});

export function parseEnv(source: Record<string, string | undefined>) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }

  const data = result.data;
  return {
    databaseUrl: data.DATABASE_URL,
    apiPort: data.API_PORT,
    trustedProxyHops: data.TRUSTED_PROXY_HOPS,
    environment: data.NODE_ENV,
    webOrigin: new URL(data.WEB_ORIGIN).origin,
    cookieName: data.AUTH_COOKIE_NAME,
    cookieSecure: data.AUTH_COOKIE_SECURE ?? data.NODE_ENV === 'production',
    sessionIdleTtlSeconds: data.AUTH_SESSION_IDLE_TTL_SECONDS,
    sessionAbsoluteTtlSeconds: data.AUTH_SESSION_ABSOLUTE_TTL_SECONDS,
    invitationTtlSeconds: data.AUTH_INVITATION_TTL_SECONDS,
    passwordResetTtlSeconds: data.AUTH_PASSWORD_RESET_TTL_SECONDS,
    rateLimitKey: data.AUTH_RATE_LIMIT_KEY ?? 'classloom-local-rate-limit-key-only-for-development',
    rateLimits: {
      login: { limit: data.AUTH_LOGIN_LIMIT, windowSeconds: data.AUTH_LOGIN_WINDOW_SECONDS },
      invitation: { limit: data.AUTH_INVITATION_LIMIT, windowSeconds: data.AUTH_INVITATION_WINDOW_SECONDS },
      reset: { limit: data.AUTH_RESET_LIMIT, windowSeconds: data.AUTH_RESET_WINDOW_SECONDS },
    },
    argon2: {
      memoryKiB: data.ARGON2_MEMORY_KIB,
      timeCost: data.ARGON2_TIME_COST,
      parallelism: data.ARGON2_PARALLELISM,
    },
    smtp: {
      host: data.SMTP_HOST ?? 'localhost',
      port: data.SMTP_PORT ?? 1025,
      secure: data.SMTP_TLS_MODE === 'implicit',
      requireTls: data.SMTP_TLS_MODE === 'starttls',
      username: data.SMTP_USERNAME,
      password: data.SMTP_PASSWORD,
      from: data.SMTP_FROM ?? 'ClassLoom <no-reply@localhost>',
    },
  };
}

export function parseRuntimeEnv(source: Record<string, string | undefined> = process.env) {
  const runtimeSource = { ...source };
  if (runtimeSource.NODE_ENV === 'test' && !runtimeSource.DATABASE_URL) {
    runtimeSource.DATABASE_URL = 'postgresql://localhost/classloom_test';
  }
  return parseEnv(runtimeSource);
}
