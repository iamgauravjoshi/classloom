import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { bootstrapTenantAdmin } from '@classloom/db';
import { AppModule } from '../app.module.js';
import { DatabaseService } from '../database/database.service.js';

export function parseBootstrapArgs(args: string[]): { tenantId: string; email: string } {
  const normalized = args[0] === '--' ? args.slice(1) : args;
  const [tenantId, email, ...extra] = normalized;
  if (!tenantId || !email || extra.length) {
    throw new Error('Usage: pnpm --filter @classloom/api auth:bootstrap-admin -- <tenant-id> <email>');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error('tenant-id must be a UUID');
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('email must be valid');
  return { tenantId, email };
}

const args = parseBootstrapArgs(process.argv.slice(2));
const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const result = await bootstrapTenantAdmin(app.get(DatabaseService).db, args);
  console.log(result.alreadyAssigned
    ? `Tenant administrator already assigned to membership ${result.membershipId}`
    : `Tenant administrator assigned to membership ${result.membershipId}`);
} finally {
  await app.close();
}

