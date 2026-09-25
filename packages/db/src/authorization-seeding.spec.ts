import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { BUILT_IN_ROLE_TEMPLATES, PERMISSION_CATALOG } from './authorization-catalog.js';
import { seedTenantAuthorization } from './authorization-seeding.js';
import { authorizationRolePermissions, authorizationRoles } from './schema.js';
import { withTenantContext } from './tenant-context.js';

const provisionerUrl = process.env.DATABASE_PROVISIONER_URL;
const runtimeUrl = process.env.DATABASE_URL;

describe.skipIf(!provisionerUrl || !runtimeUrl)('authorization seeding', () => {
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  const tenantIds: string[] = [];

  beforeAll(() => {
    admin = postgres(provisionerUrl!, { max: 1 });
    runtime = createDb(runtimeUrl!, { maxConnections: 1 });
  });

  afterAll(async () => {
    for (const tenantId of tenantIds) await admin`delete from tenants where id = ${tenantId}`;
    await runtime.close();
    await admin.end();
  });

  it('seeds built-in templates and permission mappings idempotently', async () => {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await admin`insert into tenants (id,name,slug) values (${tenantId},'Authorization Seed',${`authorization-${tenantId}`})`;
    await admin`insert into schools (tenant_id,name,code,timezone,currency) values (${tenantId},'Authorization School',${`AUTH-${tenantId}`},'UTC','USD')`;

    await withTenantContext(runtime.db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));
    await withTenantContext(runtime.db, tenantId, (tx) => seedTenantAuthorization(tx, tenantId));

    const roles = await withTenantContext(runtime.db, tenantId, (tx) =>
      tx.select({ key: authorizationRoles.key, systemKey: authorizationRoles.systemKey }).from(authorizationRoles),
    );
    const permissions = await withTenantContext(runtime.db, tenantId, (tx) =>
      tx.select({ roleId: authorizationRolePermissions.roleId, permissionKey: authorizationRolePermissions.permissionKey })
        .from(authorizationRolePermissions),
    );

    expect(roles.map(({ key }) => key).sort()).toEqual(BUILT_IN_ROLE_TEMPLATES.map(({ key }) => key).sort());
    expect(roles.every(({ key, systemKey }) => key === systemKey)).toBe(true);
    expect(permissions).toHaveLength(BUILT_IN_ROLE_TEMPLATES.reduce((count, role) => count + role.permissionKeys.length, 0));
    expect(permissions.length).toBeGreaterThanOrEqual(PERMISSION_CATALOG.length);
  });

  it('seeds permission catalog and roles for a tenant that existed before the seed migration', async () => {
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await admin`insert into tenants (id,name,slug) values (${tenantId},'Pre-existing Tenant',${`preexisting-${tenantId}`})`;

    const seedMigration = readFileSync(new URL('../drizzle/0008_seed_authorization.sql', import.meta.url), 'utf8');
    await admin.begin(async (transaction) => {
      await transaction`lock table tenants in share row exclusive mode`;
      for (const statement of seedMigration.split('--> statement-breakpoint').map((part) => part.trim()).filter(Boolean)) {
        await transaction.unsafe(statement);
      }

      const roles = await transaction<{ key: string }[]>`
        select key from authorization_roles where tenant_id = ${tenantId} order by key
      `;
      const permissionCount = await transaction<{ count: number }[]>`select count(*)::int as count from permissions`;

      expect(roles.map(({ key }) => key).sort()).toEqual(BUILT_IN_ROLE_TEMPLATES.map(({ key }) => key).sort());
      expect(permissionCount[0]!.count).toBe(PERMISSION_CATALOG.length);
    });
  });
});
