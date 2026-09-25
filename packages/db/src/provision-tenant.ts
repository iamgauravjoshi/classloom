import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createDb } from './client.js';
import { provisionTenant, ProvisioningConflictError, type ProvisionTenantInput } from './provisioning.js';

export function parseProvisionTenantArgs(args: string[]): ProvisionTenantInput {
  const { values } = parseArgs({
    args: args[0] === '--' ? args.slice(1) : args,
    options: {
      name: { type: 'string' },
      slug: { type: 'string' },
      'school-name': { type: 'string' },
      'school-code': { type: 'string' },
      timezone: { type: 'string' },
      currency: { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  return {
    tenantName: requireValue(values.name, '--name'),
    tenantSlug: requireValue(values.slug, '--slug'),
    schoolName: requireValue(values['school-name'], '--school-name'),
    schoolCode: requireValue(values['school-code'], '--school-code'),
    timezone: requireValue(values.timezone, '--timezone'),
    currency: requireValue(values.currency, '--currency'),
  };
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value?.trim()) throw new Error(`${flag} is required`);
  return value;
}

async function run(): Promise<void> {
  let input: ProvisionTenantInput;
  try {
    input = parseProvisionTenantArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid provisioning arguments');
    process.exitCode = 2;
    return;
  }

  const databaseUrl = process.env.DATABASE_PROVISIONER_URL;
  if (!databaseUrl) {
    console.error('DATABASE_PROVISIONER_URL is required');
    process.exitCode = 2;
    return;
  }

  const { db, close } = createDb(databaseUrl);
  try {
    const result = await provisionTenant(db, input);
    console.log(`Tenant created: ${result.tenant.id}`);
    console.log(`School created: ${result.school.id}`);
  } catch (error) {
    if (error instanceof ProvisioningConflictError) console.error(error.message);
    else console.error('Tenant provisioning failed');
    process.exitCode = 1;
  } finally {
    await close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
