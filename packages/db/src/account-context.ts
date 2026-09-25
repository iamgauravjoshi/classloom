import { sql } from 'drizzle-orm';
import type { AppDb, TenantTransaction } from './client.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withAccountContext<T>(
  db: AppDb,
  accountId: string,
  work: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!uuidPattern.test(accountId)) throw new Error('accountId must be a valid UUID');

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.account_id', ${accountId}, true)`);
    return work(tx);
  });
}
