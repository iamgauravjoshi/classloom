import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from './database.service.js';

describe('DatabaseService', () => {
  it('closes its database pool during Nest shutdown', async () => {
    const close = vi.fn(async () => undefined);
    const db = {} as never;
    const service = new DatabaseService({ db, close });

    await service.onApplicationShutdown();

    expect(service.db).toBe(db);
    expect(close).toHaveBeenCalledOnce();
  });
});
