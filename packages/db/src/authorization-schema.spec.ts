import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import * as schema from './schema.js';
import * as dbExports from './index.js';

describe('authorization schema', () => {
  it('defines the permission catalog and tenant role tables', () => {
    for (const name of ['permissions', 'authorizationRoles', 'authorizationRolePermissions', 'membershipRoleAssignments']) {
      expect(schema, `${name} table`).toHaveProperty(name);
      expect(getTableConfig(schema[name as keyof typeof schema] as never).columns.length).toBeGreaterThan(0);
    }
  });

  it('exports authorization tables from the DB package entrypoint', () => {
    for (const name of ['permissions', 'authorizationRoles', 'authorizationRolePermissions', 'membershipRoleAssignments'] as const) {
      expect(dbExports[name]).toBe(schema[name]);
    }
  });

  it('forces tenant RLS for role, role-permission, and assignment tables', () => {
    for (const name of ['authorizationRoles', 'authorizationRolePermissions', 'membershipRoleAssignments'] as const) {
      const config = getTableConfig(schema[name] as never);
      expect(config.enableRLS, name).toBe(true);
      expect(config.policies.map(({ name: policyName }) => policyName), name).toContain(`${config.name}_tenant_isolation`);
    }
  });

  it('keeps the application permission catalog global and keyed by permission string', () => {
    const config = getTableConfig(schema.permissions as never);
    expect(config.enableRLS).toBe(false);
    expect(config.columns.map(({ name }) => name)).toContain('key');
    expect(config.columns.find(({ name }) => name === 'key')?.primary).toBe(true);
  });

  it('declares same-tenant foreign keys and the role-scope shape check', () => {
    const config = getTableConfig(schema.membershipRoleAssignments as never);
    expect(config.foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(expect.arrayContaining([
      'membership_role_assignments_tenant_membership_fk',
      'membership_role_assignments_tenant_role_fk',
      'membership_role_assignments_tenant_school_fk',
      'membership_role_assignments_tenant_campus_fk',
    ]));
    expect(config.checks.map((constraint) => constraint.name)).toContain('membership_role_assignments_scope_shape_check');
    expect(config.uniqueConstraints.find((constraint) => constraint.getName() === 'membership_role_assignments_grant_unique')?.nullsNotDistinct).toBe(true);
  });

  it('forces RLS and limits runtime catalog grants in the generated migration', () => {
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as {
      entries: { tag: string }[];
    };
    const migrations = journal.entries.map(({ tag }) =>
      readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8'),
    );

    for (const table of ['authorization_roles', 'authorization_role_permissions', 'membership_role_assignments']) {
      expect(migrations.some((migration) => migration.includes(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`))).toBe(true);
    }
    expect(migrations.some((migration) => migration.includes('GRANT SELECT ON TABLE permissions TO classloom_runtime'))).toBe(true);
  });

  it.skipIf(!process.env.DATABASE_MIGRATION_URL)(
    'applies forced tenant RLS and least-privilege catalog access in PostgreSQL',
    async () => {
      const client = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
      try {
        const tables = await client<{
          tableName: string;
          rowSecurity: boolean;
          forceRls: boolean;
          tenantPolicy: boolean;
        }[]>`
          select c.relname as "tableName", c.relrowsecurity as "rowSecurity",
            c.relforcerowsecurity as "forceRls",
            exists (
              select 1 from pg_policies p
              where p.schemaname = n.nspname and p.tablename = c.relname
                and p.policyname = c.relname || '_tenant_isolation'
            ) as "tenantPolicy"
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema()
            and c.relname in ('authorization_roles', 'authorization_role_permissions', 'membership_role_assignments')
          order by c.relname
        `;
        const grants = await client<{ catalogRead: boolean; rolesWrite: boolean }[]>`
          select has_table_privilege('classloom_runtime', 'permissions', 'SELECT') as "catalogRead",
            has_table_privilege('classloom_runtime', 'authorization_roles', 'INSERT') as "rolesWrite"
        `;

        expect(tables).toHaveLength(3);
        expect(tables.every((table) => table.rowSecurity && table.forceRls && table.tenantPolicy)).toBe(true);
        expect(grants).toEqual([{ catalogRead: true, rolesWrite: true }]);
      } finally {
        await client.end();
      }
    },
  );
});
