import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import * as dbExports from './index.js';
import * as schema from './schema.js';

const tables = schema as unknown as Record<string, unknown>;

describe('identity schema', () => {
  it('exports authentication tables from the database package entrypoint', () => {
    for (const name of [
      'accounts',
      'accountCredentials',
      'memberships',
      'sessions',
      'invitations',
      'passwordResetTokens',
      'securityEvents',
      'authRateLimits',
    ]) {
      expect(dbExports).toHaveProperty(name);
    }
  });

  it('exports all account, membership, and authentication tables', () => {
    for (const name of [
      'accounts',
      'accountCredentials',
      'memberships',
      'sessions',
      'invitations',
      'passwordResetTokens',
      'securityEvents',
      'authRateLimits',
    ]) {
      expect(tables[name], `${name} table`).toBeDefined();
      expect(getTableColumns(tables[name] as never)).toBeDefined();
    }
  });

  it('requires account or tenant context for membership access', () => {
    const config = getTableConfig(tables.memberships as never);

    expect(config.enableRLS).toBe(true);
    expect(config.policies.map((policy) => policy.name)).toEqual(
      expect.arrayContaining(['memberships_tenant_isolation', 'memberships_account_read']),
    );
  });

  it('prevents a session from selecting a membership owned by another account', () => {
    const config = getTableConfig(tables.sessions as never);
    const accountMembershipConstraint = config.foreignKeys.find((foreignKey) =>
      foreignKey.getName() === 'sessions_account_membership_fk',
    );

    expect(accountMembershipConstraint).toBeDefined();
  });

  it('keeps one membership per account and tenant', () => {
    const config = getTableConfig(tables.memberships as never);
    const accountTenantKey = config.indexes.find(
      (index) => index.config.name === 'memberships_account_tenant_unique',
    );

    expect(accountTenantKey?.config.unique).toBe(true);
  });

  it('applies tenant RLS to invitation records', () => {
    const config = getTableConfig(tables.invitations as never);

    expect(config.enableRLS).toBe(true);
    expect(config.policies.map((policy) => policy.name)).toContain('invitations_tenant_isolation');
  });

  it('indexes session, invitation, reset, and rate-limit expiry lookups', () => {
    const requirements = [
      ['sessions', 'sessions_expiry_idx'],
      ['invitations', 'invitations_expiry_idx'],
      ['passwordResetTokens', 'password_reset_tokens_expiry_idx'],
      ['authRateLimits', 'auth_rate_limits_window_idx'],
    ] as const;

    for (const [tableName, indexName] of requirements) {
      const config = getTableConfig(tables[tableName] as never);
      expect(config.indexes.map((index) => index.config.name)).toContain(indexName);
    }
  });

  it('creates the membership unique key before the session composite foreign key', () => {
    const migration = readFileSync(new URL('../drizzle/0003_breezy_dark_beast.sql', import.meta.url), 'utf8');
    const referencedKey = migration.indexOf('CREATE UNIQUE INDEX "memberships_account_id_id_unique"');
    const reference = migration.indexOf('ADD CONSTRAINT "sessions_account_membership_fk"');

    expect(referencedKey).toBeGreaterThanOrEqual(0);
    expect(reference).toBeGreaterThan(referencedKey);
  });

  it.skipIf(!process.env.DATABASE_MIGRATION_URL)(
    'migrates forced RLS and both membership read policies',
    async () => {
      const client = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
      try {
        const rows = await client<{
          tableName: string;
          rowSecurity: boolean;
          forceRls: boolean;
          tenantPolicy: boolean;
          accountPolicy: boolean;
        }[]>`
          select c.relname as "tableName",
            c.relrowsecurity as "rowSecurity",
            c.relforcerowsecurity as "forceRls",
            exists (
              select 1 from pg_policies p
              where p.schemaname = n.nspname and p.tablename = c.relname
                and p.policyname = c.relname || '_tenant_isolation'
            ) as "tenantPolicy",
            exists (
              select 1 from pg_policies p
              where p.schemaname = n.nspname and p.tablename = c.relname
                and p.policyname = 'memberships_account_read'
            ) as "accountPolicy"
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = current_schema() and c.relname in ('invitations', 'memberships')
          order by c.relname
        `;

        expect(rows).toEqual([
          { tableName: 'invitations', rowSecurity: true, forceRls: true, tenantPolicy: true, accountPolicy: false },
          { tableName: 'memberships', rowSecurity: true, forceRls: true, tenantPolicy: true, accountPolicy: true },
        ]);
      } finally {
        await client.end();
      }
    },
  );
});
