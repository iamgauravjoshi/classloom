import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

function labelFor(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase());
}

export function parseRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : 'request';
    if (fields[key]) continue;
    const label = labelFor(String(issue.path.at(-1) ?? 'request'));
    fields[key] = issue.code === 'invalid_type'
      ? `${label} is required or has an invalid value`
      : issue.message === 'Invalid input' ? `Please check ${label.toLowerCase()}` : issue.message;
  }
  throw new BadRequestException({ message: Object.values(fields)[0] ?? 'Please check the form', details: { fields } });
}
