import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDb } from './client.js';
import * as dbExports from './index.js';
import { memberships } from './schema.js';
import { withAccountContext } from './account-context.js';

describe('withAccountContext', () => {
  it('is exported from the database package entrypoint', () => {
    expect(dbExports).toHaveProperty('withAccountContext');
  });

  it('rejects malformed UUIDs before starting a transaction', async () => {
    const transaction = vi.fn();
    const db = { transaction } as never;

    await expect(withAccountContext(db, 'not-a-uuid', async () => undefined))
      .rejects.toThrow('accountId must be a valid UUID');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('sets a transaction-local account context before invoking the callback', async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { execute };
    const db = {
      transaction: (callback: (transaction: typeof tx) => Promise<string>) => callback(tx),
    } as never;
    const accountId = randomUUID();

    const value = await withAccountContext(db, accountId, async () => 'done');

    expect(execute).toHaveBeenCalledOnce();
    expect(value).toBe('done');
  });

  it.skipIf(!process.env.DATABASE_URL)(
    'limits membership reads to this account and clears context after the transaction',
    async () => {
      const database = createDb(process.env.DATABASE_URL!, { maxConnections: 1 });
      try {
        const [accountA, accountB] = await database.db.select({ id: memberships.accountId })
          .from(memberships).limit(2);
        if (!accountA || !accountB) return;

        const ownRows = await withAccountContext(database.db, accountA.id, (tx) =>
          tx.select({ accountId: memberships.accountId }).from(memberships),
        );
        expect(ownRows.every((row) => row.accountId === accountA.id)).toBe(true);
        await expect(database.db.select().from(memberships)).resolves.toEqual([]);
      } finally {
        await database.close();
      }
    },
  );
});
