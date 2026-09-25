import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value)),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
});

export function parseEnv(source: Record<string, string | undefined>) {
  const result = schema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    apiPort: result.data.API_PORT,
    webOrigin: result.data.WEB_ORIGIN,
  };
}
