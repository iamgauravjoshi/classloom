import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { IdentityFlowService } from './identity-flow.service.js';

const [tenantId, email] = process.argv.slice(2).filter((argument) => argument !== '--');
if (!tenantId || !email) throw new Error('Usage: pnpm --filter @classloom/api auth:invite -- <tenant-id> <email>');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
  throw new Error('tenant-id must be a UUID');
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
try {
  const result = await app.get(IdentityFlowService).issueInvitation(tenantId, email);
  console.log(`Invitation sent (${result.invitationId})`);
} finally {
  await app.close();
}
