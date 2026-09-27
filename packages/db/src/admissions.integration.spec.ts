import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import {
  AdmissionError,
  createAdmissionCase,
  getAdmissionCase,
  listAdmissionCaseEvents,
  listAdmissionCases,
  transitionAdmissionCase,
  updateAdmissionCase,
} from './admissions.js';
import { createAccountWithMembership } from './identity-repository.js';
import { provisionTenant } from './provisioning.js';
import {
  admissionCaseEvents,
  admissionCaseGuardians,
  admissionCases,
  securityEvents,
} from './schema.js';
import { withTenantContext } from './tenant-context.js';

const enabled = Boolean(process.env.DATABASE_URL && process.env.DATABASE_PROVISIONER_URL);

describe.skipIf(!enabled)('admissions persistence and tenant isolation', () => {
  const slug = `admissions-${randomUUID()}`;
  const foreignSlug = `admissions-foreign-${randomUUID()}`;
  const actorEmail = `admissions-${randomUUID()}@example.test`;
  let admin: ReturnType<typeof postgres>;
  let runtime: ReturnType<typeof createDb>;
  let provisioner: ReturnType<typeof createDb>;
  let tenantId: string;
  let schoolId: string;
  let foreignTenantId: string;
  let actor: { accountId: string; membershipId: string };

  beforeAll(async () => {
    admin = postgres(process.env.DATABASE_PROVISIONER_URL!, { max: 1 });
    runtime = createDb(process.env.DATABASE_URL!, { maxConnections: 6 });
    provisioner = createDb(process.env.DATABASE_PROVISIONER_URL!);
    const one = await provisionTenant(provisioner.db, {
      tenantName: slug, tenantSlug: slug, schoolName: 'Admissions School', schoolCode: 'ADM1', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    const foreign = await provisionTenant(provisioner.db, {
      tenantName: foreignSlug, tenantSlug: foreignSlug, schoolName: 'Foreign School', schoolCode: 'ADM2', timezone: 'Asia/Kolkata', currency: 'INR',
    });
    tenantId = one.tenant.id;
    schoolId = one.school.id;
    foreignTenantId = foreign.tenant.id;
    const membership = await createAccountWithMembership(runtime.db, { email: actorEmail, passwordHash: 'fixture-hash', tenantId });
    actor = { accountId: membership.id, membershipId: membership.membershipId };
  });

  afterAll(async () => {
    if (admin) {
      if (tenantId) {
        await admin`delete from admission_case_events where tenant_id = ${tenantId}`;
        await admin`delete from admission_case_guardians where tenant_id = ${tenantId}`;
        await admin`delete from admission_cases where tenant_id = ${tenantId}`;
        await admin`delete from security_events where tenant_id = ${tenantId} and event_type like 'admissions_case_%'`;
        await admin`delete from tenants where id = ${tenantId}`;
      }
      if (foreignTenantId) await admin`delete from tenants where id = ${foreignTenantId}`;
      if (actorEmail) await admin`delete from accounts where normalized_email = ${actorEmail}`;
      await admin.end();
    }
    if (runtime) await runtime.close();
    if (provisioner) await provisioner.close();
  });

  const scope = () => ({ tenantId, schoolId });
  const actorInfo = () => actor;

  it('creates a case and guardian rows atomically, preserves partial edits, and denies foreign tenant reads', async () => {
    const created = await withTenantContext(runtime.db, tenantId, (tx) => createAdmissionCase(tx, scope(), {
      status: 'draft', studentGivenName: 'Mira', studentFamilyName: 'Applicant',
      guardians: [{ givenName: 'Ravi', familyName: 'Guardian', relationshipType: 'father' }],
    }, actorInfo()));
    expect(created).toMatchObject({ status: 'draft', studentGivenName: 'Mira', guardians: [{ ordinal: 1, givenName: 'Ravi' }] });

    const updated = await withTenantContext(runtime.db, tenantId, (tx) => updateAdmissionCase(tx, scope(), created.id, {
      studentEmail: 'mira@example.test',
    }, actorInfo()));
    expect(updated).toMatchObject({ studentGivenName: 'Mira', studentEmail: 'mira@example.test', guardians: [{ givenName: 'Ravi' }] });
    expect(await withTenantContext(runtime.db, tenantId, (tx) => listAdmissionCaseEvents(tx, scope(), created.id))).toHaveLength(2);
    await expect(withTenantContext(runtime.db, foreignTenantId, (tx) => getAdmissionCase(tx, { tenantId: foreignTenantId, schoolId }, created.id)))
      .rejects.toBeInstanceOf(AdmissionError);
    expect(await runtime.db.select().from(admissionCases).where(eq(admissionCases.id, created.id))).toEqual([]);
  });

  it('serializes concurrent decisions so only one final decision wins', async () => {
    const created = await withTenantContext(runtime.db, tenantId, (tx) => createAdmissionCase(tx, scope(), { status: 'draft' }, actorInfo()));
    const submitted = await withTenantContext(runtime.db, tenantId, (tx) => transitionAdmissionCase(tx, scope(), created.id, 'submit', actorInfo()));
    expect(submitted.status).toBe('submitted');
    await withTenantContext(runtime.db, tenantId, (tx) => transitionAdmissionCase(tx, scope(), created.id, 'start_review', actorInfo()));
    const decisions = await Promise.allSettled([
      withTenantContext(runtime.db, tenantId, (tx) => transitionAdmissionCase(tx, scope(), created.id, 'accept', actorInfo(), 'Application reviewed')),
      withTenantContext(runtime.db, tenantId, (tx) => transitionAdmissionCase(tx, scope(), created.id, 'reject', actorInfo(), 'Does not meet criteria')),
    ]);
    expect(decisions.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const fresh = await withTenantContext(runtime.db, tenantId, (tx) => getAdmissionCase(tx, scope(), created.id));
    expect(['accepted', 'rejected']).toContain(fresh.status);
  });

  it('rolls back a decision, event, and audit record when the enclosing transaction fails', async () => {
    const created = await withTenantContext(runtime.db, tenantId, (tx) => createAdmissionCase(tx, scope(), { status: 'draft' }, actorInfo()));
    await withTenantContext(runtime.db, tenantId, async (tx) => {
      await transitionAdmissionCase(tx, scope(), created.id, 'submit', actorInfo());
      await transitionAdmissionCase(tx, scope(), created.id, 'start_review', actorInfo());
    });
    const beforeEvents = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(admissionCaseEvents).where(eq(admissionCaseEvents.caseId, created.id)));
    const beforeAudit = await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(securityEvents).where(eq(securityEvents.eventType, 'admissions_case_admitted')));
    await expect(withTenantContext(runtime.db, tenantId, async (tx) => {
      await transitionAdmissionCase(tx, scope(), created.id, 'accept', actorInfo(), 'Application reviewed');
      throw new Error('force rollback');
    })).rejects.toThrow('force rollback');
    const after = await withTenantContext(runtime.db, tenantId, (tx) => getAdmissionCase(tx, scope(), created.id));
    expect(after.status).toBe('under_review');
    expect(after.convertedStudentId).toBeNull();
    expect(await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(admissionCaseEvents).where(eq(admissionCaseEvents.caseId, created.id)))).toHaveLength(beforeEvents.length);
    expect(await withTenantContext(runtime.db, tenantId, (tx) => tx.select().from(securityEvents).where(eq(securityEvents.eventType, 'admissions_case_admitted')))).toHaveLength(beforeAudit.length);
  });

  it('bounds worklist filters and returns stable descending cursors', async () => {
    await withTenantContext(runtime.db, tenantId, async (tx) => {
      await createAdmissionCase(tx, scope(), { status: 'draft', studentGivenName: 'Searchable' }, actorInfo());
      await createAdmissionCase(tx, scope(), { status: 'draft', studentGivenName: 'Searchable' }, actorInfo());
    });
    const first = await withTenantContext(runtime.db, tenantId, (tx) => listAdmissionCases(tx, scope(), { q: 'Searchable', limit: 1 }));
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBeTruthy();
    const second = await withTenantContext(runtime.db, tenantId, (tx) => listAdmissionCases(tx, scope(), { q: 'Searchable', limit: 1, cursor: first.nextCursor! }));
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    await expect(withTenantContext(runtime.db, tenantId, (tx) => listAdmissionCases(tx, scope(), { cursor: 'not-a-cursor' })))
      .rejects.toMatchObject({ code: 'INVALID' });
  });
});
