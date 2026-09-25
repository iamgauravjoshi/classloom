import { describe, expect, it } from 'vitest';
import { checkDatabase } from './client.js';

describe('checkDatabase', () => {
  it('reports an unreachable database without leaking its credentials', async () => {
    const result = await checkDatabase('postgresql://secret:secret@127.0.0.1:1/missing');
    expect(result).toBe(false);
  });

  it.skipIf(!process.env.DATABASE_URL)('connects to the configured PostgreSQL instance', async () => {
    expect(await checkDatabase(process.env.DATABASE_URL!)).toBe(true);
  });
});
