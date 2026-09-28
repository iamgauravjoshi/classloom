import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAcademicClass, createAcademicSession } from './academics.js';
import { createDb } from './client.js';
import { createSchoolEnrollment } from './enrollment.js';
import { assignFeePlan, createFeeHead, createFeePlan, createFeePlanLine, grantFeeConcession, listFeeOutstanding, readFeeReceipt, readFeeStatement, recordFeePayment, reverseFeePayment } from './finance.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import { feeLedgerEntries } from './schema.js';
import { createStudentProfile } from './students.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('finance ledger and tenant isolation', () => {
  const slug = `finance-${randomUUID()}`;
  const email = `finance-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let schoolEnrollmentId: string;
  let chargeId: string;
  let actor: { accountId: string; membershipId: string };

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!);
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const provisioned = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Finance School', schoolCode: 'FIN', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = provisioned.tenant.id; schoolId = provisioned.school.id;
    const member = await createAccountWithMembership(runtime.db, { email, passwordHash: 'fixture-hash', tenantId });
    actor = { accountId: member.id, membershipId: member.membershipId };
    await withTenantContext(runtime.db, tenantId, async (tx) => {
      const scope = { tenantId, schoolId };
      const session = await createAcademicSession(tx, scope, { name: '2026–27', code: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31' });
      const academicClass = await createAcademicClass(tx, scope, session.id, { name: 'Grade 1', code: 'G1' });
      const student = await createStudentProfile(tx, tenantId, { studentCode: 'FIN-001', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2018-03-04' }, { actorAccountId: actor.accountId, requestId: 'finance-fixture' });
      const enrollment = await createSchoolEnrollment(tx, scope, student.id, { admissionNumber: 'FIN-ADM-001', admissionDate: '2026-04-01' }, { actorAccountId: actor.accountId, requestId: 'finance-fixture' });
      schoolEnrollmentId = enrollment.id;
      const head = await createFeeHead(tx, scope, { code: 'TUITION', name: 'Tuition' });
      const plan = await createFeePlan(tx, scope, { sessionId: session.id, classId: academicClass.id, name: 'Term plan' });
      await createFeePlanLine(tx, scope, plan.id, { headId: head.id, label: 'Term 1', dueDate: '2026-10-01', amountMinor: '12500' });
      await assignFeePlan(tx, scope, plan.id, enrollment.id, 'INR', actor);
      chargeId = (await readFeeStatement(tx, scope, enrollment.id)).charges[0].id;
    });
  });

  afterAll(async () => {
    if (admin) {
      if (tenantId) {
        for (const table of ['fee_ledger_entries', 'fee_payments', 'fee_receipt_counters', 'fee_charges', 'fee_assignments', 'fee_plan_lines', 'fee_plans', 'fee_heads', 'student_school_enrollments', 'student_profiles']) {
          await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]);
        }
        await admin`delete from tenants where id = ${tenantId}`;
      }
      await admin`delete from accounts where normalized_email = ${email}`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  it('keeps exact balances, retries one receipt, and reverses by compensation', async () => {
    const scope = { tenantId, schoolId };
    const initial = await withTenantContext(runtime.db, tenantId, (tx) => readFeeStatement(tx, scope, schoolEnrollmentId));
    expect(initial.outstandingMinor).toBe('12500');
    await withTenantContext(runtime.db, tenantId, (tx) => grantFeeConcession(tx, scope, schoolEnrollmentId, chargeId, '500', 'Scholarship award', actor));
    const key = randomUUID();
    const input = { schoolEnrollmentId, idempotencyKey: key, method: 'cash', allocations: [{ chargeId, amountMinor: '5000' }] };
    const first = await withTenantContext(runtime.db, tenantId, (tx) => recordFeePayment(tx, scope, input, actor));
    const replay = await withTenantContext(runtime.db, tenantId, (tx) => recordFeePayment(tx, scope, input, actor));
    expect(replay.id).toBe(first.id);
    expect(first.receiptNumber).toBe('1');
    expect((await withTenantContext(runtime.db, tenantId, (tx) => readFeeStatement(tx, scope, schoolEnrollmentId))).outstandingMinor).toBe('7000');
    await expect(withTenantContext(runtime.db, tenantId, (tx) => recordFeePayment(tx, scope, { ...input, idempotencyKey: randomUUID(), allocations: [{ chargeId, amountMinor: '7001' }] }, actor))).rejects.toThrow('exceeds');
    const reversed = await withTenantContext(runtime.db, tenantId, (tx) => reverseFeePayment(tx, scope, first.id, 'Duplicate cash entry', actor));
    expect(reversed.reversed).toBe(true);
    expect((await withTenantContext(runtime.db, tenantId, (tx) => readFeeReceipt(tx, scope, first.id))).reversalReason).toBe('Duplicate cash entry');
    expect((await withTenantContext(runtime.db, tenantId, (tx) => listFeeOutstanding(tx, scope)))[0].outstandingMinor).toBe('12000');
    expect(await runtime.db.select().from(feeLedgerEntries)).toEqual([]);
  });
});
