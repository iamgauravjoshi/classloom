import postgres from 'postgres';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runtimeRole = 'classloom_runtime';

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function setupRuntimeRole(databaseUrl: string, password: string): Promise<void> {
  if (!password.trim()) throw new Error('DATABASE_RUNTIME_PASSWORD is required');

  const client = postgres(databaseUrl, { max: 1 });
  try {
    const [{ databaseName }] = await client<{ databaseName: string }[]>`
      select current_database() as "databaseName"
    `;
    const [existingRole] = await client<{ exists: boolean }[]>`
      select exists(select 1 from pg_roles where rolname = ${runtimeRole}) as exists
    `;

    const action = existingRole.exists ? 'ALTER ROLE' : 'CREATE ROLE';
    const passwordLiteral = quoteLiteral(password);
    await client.unsafe(
      `${action} ${runtimeRole} WITH LOGIN PASSWORD ${passwordLiteral} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`,
    );
    await client.unsafe(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${runtimeRole}`,
    );
  } finally {
    await client.end();
  }
}

const databaseUrl = process.env.DATABASE_MIGRATION_URL;
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!databaseUrl) throw new Error('DATABASE_MIGRATION_URL is required');
  const password = process.env.DATABASE_RUNTIME_PASSWORD;
  if (!password) throw new Error('DATABASE_RUNTIME_PASSWORD is required');

  await setupRuntimeRole(databaseUrl, password);
  console.log(`Database role ${runtimeRole} is ready`);
}
