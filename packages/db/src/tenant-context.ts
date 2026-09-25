import { sql } from 'drizzle-orm';
import type { AppDb, TenantTransaction } from './client.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenantContext<T>(
  db: AppDb,
  tenantId: string,
  work: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  if (!uuidPattern.test(tenantId)) throw new Error('tenantId must be a valid UUID');

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return work(tx);
  });
}
