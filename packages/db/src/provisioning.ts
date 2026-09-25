import { sql } from 'drizzle-orm';
import type { AppDb } from './client.js';
import { schools, tenants } from './schema.js';

export interface ProvisionTenantInput {
  tenantName: string;
  tenantSlug: string;
  schoolName: string;
  schoolCode: string;
  timezone: string;
  currency: string;
}

export class ProvisioningConflictError extends Error {
  readonly code = 'PROVISIONING_CONFLICT';

  constructor() {
    super('Tenant slug or school code already exists');
    this.name = 'ProvisioningConflictError';
  }
}

export async function provisionTenant(
  db: AppDb,
  input: ProvisionTenantInput,
): Promise<{ tenant: typeof tenants.$inferSelect; school: typeof schools.$inferSelect }> {
  try {
    return await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({
        name: input.tenantName,
        slug: input.tenantSlug,
      }).returning();

      await tx.execute(sql`select set_config('app.tenant_id', ${tenant.id}, true)`);

      const [school] = await tx.insert(schools).values({
        tenantId: tenant.id,
        name: input.schoolName,
        code: input.schoolCode,
        timezone: input.timezone,
        currency: input.currency,
      }).returning();

      return { tenant, school };
    });
  } catch (error) {
    if (hasSqlState(error, '23505')) throw new ProvisioningConflictError();
    throw error;
  }
}

function hasSqlState(error: unknown, code: string): boolean {
  if (error === null || typeof error !== 'object') return false;
  if ('code' in error && error.code === code) return true;
  if ('cause' in error) return hasSqlState(error.cause, code);
  return false;
}
