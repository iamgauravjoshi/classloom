import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { beginStudentImportBatch, completeStudentImportBatch, StudentImportBatchError } from './student-import.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('student import batch idempotency', () => {
  const slug = `student-import-${randomUUID()}`;
  const email = `student-import-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let accountId: string;

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!);
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const provisioned = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Import School', schoolCode: 'IMP', timezone: 'UTC', currency: 'USD',
    });
    tenantId = provisioned.tenant.id;
    schoolId = provisioned.school.id;
    accountId = (await createAccountWithMembership(runtime.db, { email, passwordHash: 'fixture-hash', tenantId })).id;
  });

  afterAll(async () => {
    if (admin) {
      await admin`delete from student_import_batches where tenant_id = ${tenantId}`;
      await admin`delete from tenants where slug = ${slug}`;
      await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    await runtime?.close();
    await provisioner?.close();
  });

  it('returns a completed same-payload retry and rejects changed payload reuse', async () => {
    const scope = { tenantId, schoolId };
    const checksum = 'a'.repeat(64);
    const first = await withTenantContext(runtime.db, tenantId, async (tx) => {
      const started = await beginStudentImportBatch(tx, scope, accountId, 'retry-key', checksum);
      expect(started.replayed).toBe(false);
      return completeStudentImportBatch(tx, scope, started.batch.id, { studentCount: 2, guardianCount: 1, enrollmentCount: 2 });
    });
    expect(first.status).toBe('completed');
    await expect(withTenantContext(runtime.db, tenantId, async (tx) => beginStudentImportBatch(tx, scope, accountId, 'retry-key', checksum)))
      .resolves.toMatchObject({ replayed: true, batch: { studentCount: 2 } });
    await expect(withTenantContext(runtime.db, tenantId, async (tx) => beginStudentImportBatch(tx, scope, accountId, 'retry-key', 'b'.repeat(64))))
      .rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<StudentImportBatchError>);
  });

  it('rolls back a processing batch with its surrounding transaction', async () => {
    await expect(withTenantContext(runtime.db, tenantId, async (tx) => {
      await beginStudentImportBatch(tx, { tenantId, schoolId }, accountId, 'rolled-back', 'c'.repeat(64));
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    await expect(withTenantContext(runtime.db, tenantId, (tx) => beginStudentImportBatch(tx, { tenantId, schoolId }, accountId, 'rolled-back', 'c'.repeat(64))))
      .resolves.toMatchObject({ replayed: false });
  });
});
