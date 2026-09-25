import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { setupRuntimeRole } from './setup-runtime-role.js';

describe('setupRuntimeRole', () => {
  it('rejects an empty password before opening a database connection', async () => {
    await expect(setupRuntimeRole('not-a-real-database-url', '')).rejects.toThrow(
      'DATABASE_RUNTIME_PASSWORD is required',
    );
  });

  it.skipIf(!process.env.DATABASE_MIGRATION_URL || !process.env.DATABASE_RUNTIME_PASSWORD)(
    'creates a limited login role and can be rerun safely',
    async () => {
      await setupRuntimeRole(process.env.DATABASE_MIGRATION_URL!, process.env.DATABASE_RUNTIME_PASSWORD!);
      await setupRuntimeRole(process.env.DATABASE_MIGRATION_URL!, process.env.DATABASE_RUNTIME_PASSWORD!);

      const client = postgres(process.env.DATABASE_MIGRATION_URL!, { max: 1 });
      try {
        const [role] = await client<{
          can_login: boolean;
          superuser: boolean;
          create_database: boolean;
          create_role: boolean;
          bypass_rls: boolean;
          has_connect: boolean;
        }[]>`
          select r.rolcanlogin as can_login,
            r.rolsuper as superuser,
            r.rolcreatedb as create_database,
            r.rolcreaterole as create_role,
            r.rolbypassrls as bypass_rls,
            has_database_privilege(r.rolname, current_database(), 'CONNECT') as has_connect
          from pg_roles r
          where r.rolname = 'classloom_runtime'
        `;

        expect(role).toEqual({
          can_login: true,
          superuser: false,
          create_database: false,
          create_role: false,
          bypass_rls: false,
          has_connect: true,
        });
      } finally {
        await client.end();
      }
    },
  );
});
