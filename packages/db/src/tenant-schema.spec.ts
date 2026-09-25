import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import * as dbExports from './index.js';
import * as schema from './schema.js';

const schemaExports = schema as unknown as Record<string, unknown>;

describe('tenant schema', () => {
  it('exports tenant, school, and campus tables with required ownership fields', () => {
    const requirements = [
      ['tenants', ['id', 'name', 'slug', 'status', 'createdAt', 'updatedAt']],
      ['schools', ['id', 'tenantId', 'name', 'code', 'timezone', 'currency', 'createdAt', 'updatedAt']],
      ['campuses', ['id', 'tenantId', 'schoolId', 'name', 'code', 'createdAt', 'updatedAt']],
    ] as const;

    for (const [tableName, requiredColumns] of requirements) {
      const table = schemaExports[tableName];
      expect(table, `${tableName} export`).toBeDefined();
      const columns = getTableColumns(table as never);
      for (const columnName of requiredColumns) {
        expect(columns, `${tableName}.${columnName}`).toHaveProperty(columnName);
      }
    }
  });

  it('exports the tenant tables from the database package entrypoint', () => {
    expect(dbExports).toHaveProperty('tenants');
    expect(dbExports).toHaveProperty('schools');
    expect(dbExports).toHaveProperty('campuses');
  });

  it('does not expose privileged runtime-role setup through the public package entrypoint', () => {
    expect(dbExports).not.toHaveProperty('setupRuntimeRole');
  });

  it('declares tenant RLS policies for schools and campuses', () => {
    for (const tableName of ['schools', 'campuses'] as const) {
      const tableConfig = getTableConfig(schemaExports[tableName] as never);
      expect(tableConfig.enableRLS, `${tableName} RLS`).toBe(true);
      expect(tableConfig.policies.map((policy) => policy.name)).toContain(
        `${tableName}_tenant_isolation`,
      );
    }
  });

  it.skipIf(!process.env.DATABASE_MIGRATION_URL)(
    'migrates forced RLS policies for schools and campuses',
    async () => {
      const client = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
      try {
        const rows = await client<{ tablename: string; rowsecurity: boolean; force_rls: boolean; tenant_policy: boolean }[]>`
          select c.relname as tablename,
            c.relrowsecurity as rowsecurity,
            c.relforcerowsecurity as force_rls,
            exists (
              select 1 from pg_policies p
              where p.schemaname = n.nspname
                and p.tablename = c.relname
                and p.policyname = c.relname || '_tenant_isolation'
            ) as tenant_policy
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema()
            and c.relname in ('schools', 'campuses')
          order by c.relname
        `;

        expect(rows).toEqual([
          { tablename: 'campuses', rowsecurity: true, force_rls: true, tenant_policy: true },
          { tablename: 'schools', rowsecurity: true, force_rls: true, tenant_policy: true },
        ]);
      } finally {
        await client.end();
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    'uses a runtime role that cannot bypass or own RLS-protected tables',
    async () => {
      const client = postgres(process.env.DATABASE_URL!, { max: 1 });
      try {
        const [role] = await client<{ role: string; superuser: boolean; bypass_rls: boolean; owns_tenant_tables: boolean }[]>`
          select r.rolname as role,
            r.rolsuper as superuser,
            r.rolbypassrls as bypass_rls,
            exists (
              select 1 from pg_class c
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = current_schema()
                and c.relname in ('schools', 'campuses')
                and c.relowner = r.oid
            ) as owns_tenant_tables
          from pg_roles r
          where r.rolname = current_user
        `;

        expect(role).toBeDefined();
        expect(role).toMatchObject({ superuser: false, bypass_rls: false, owns_tenant_tables: false });
      } finally {
        await client.end();
      }
    },
  );
});
