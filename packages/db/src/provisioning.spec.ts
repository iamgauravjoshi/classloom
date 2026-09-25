import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import { parseProvisionTenantArgs } from './provision-tenant.js';
import { provisionTenant, ProvisioningConflictError } from './provisioning.js';
import { authorizationRoles, schools } from './schema.js';
import { withTenantContext } from './tenant-context.js';

const provisionerUrl = process.env.DATABASE_PROVISIONER_URL;
const integrationEnabled = Boolean(provisionerUrl);
const createdSlugs: string[] = [];

describe('parseProvisionTenantArgs', () => {
  it('maps the required CLI flags to a provisioning input', () => {
    expect(parseProvisionTenantArgs([
      '--name', 'Demo Group',
      '--slug', 'demo-group',
      '--school-name', 'Demo School',
      '--school-code', 'DEMO',
      '--timezone', 'Asia/Kolkata',
      '--currency', 'INR',
    ])).toEqual({
      tenantName: 'Demo Group',
      tenantSlug: 'demo-group',
      schoolName: 'Demo School',
      schoolCode: 'DEMO',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    });
  });

  it('accepts the script-runner argument delimiter before the required flags', () => {
    expect(parseProvisionTenantArgs([
      '--',
      '--name', 'Demo Group',
      '--slug', 'demo-group',
      '--school-name', 'Demo School',
      '--school-code', 'DEMO',
      '--timezone', 'Asia/Kolkata',
      '--currency', 'INR',
    ])).toMatchObject({ tenantName: 'Demo Group', tenantSlug: 'demo-group' });
  });

  it('rejects a missing required CLI field', () => {
    expect(() => parseProvisionTenantArgs(['--name', 'Demo Group'])).toThrow();
  });
});

describe.skipIf(!integrationEnabled)('provisionTenant', () => {
  let admin: ReturnType<typeof postgres>;
  let db: ReturnType<typeof createDb>;

  beforeAll(() => {
    admin = postgres(provisionerUrl!, { max: 1 });
    db = createDb(provisionerUrl!);
  });

  afterAll(async () => {
    for (const tenantSlug of createdSlugs) {
      await admin`delete from tenants where slug = ${tenantSlug}`;
    }
    await db.close();
    await admin.end();
  });

  it('creates a tenant and its initial school atomically', async () => {
    const input = makeInput();
    createdSlugs.push(input.tenantSlug);

    const result = await provisionTenant(db.db, input);

    expect(result.tenant).toMatchObject({ name: input.tenantName, slug: input.tenantSlug, status: 'active' });
    expect(result.school).toMatchObject({
      tenantId: result.tenant.id,
      name: input.schoolName,
      code: input.schoolCode,
      timezone: input.timezone,
      currency: input.currency,
    });
    const roles = await withTenantContext(db.db, result.tenant.id, (tx) =>
      tx.select({ key: authorizationRoles.key }).from(authorizationRoles),
    );
    expect(roles.map(({ key }) => key)).toEqual(expect.arrayContaining([
      'tenant_admin', 'school_admin', 'principal', 'teacher',
      'attendance_operator', 'finance_operator', 'auditor',
    ]));
  });

  it('maps a duplicate tenant slug to a provisioning conflict and preserves the original row', async () => {
    const input = makeInput();
    createdSlugs.push(input.tenantSlug);
    await provisionTenant(db.db, input);

    await expect(provisionTenant(db.db, { ...input, tenantName: 'Duplicate tenant' }))
      .rejects.toBeInstanceOf(ProvisioningConflictError);

    const rows = await admin<{ id: string }[]>`select id from tenants where slug = ${input.tenantSlug}`;
    expect(rows).toHaveLength(1);
  });

  it('enforces school-code uniqueness within one tenant', async () => {
    const input = makeInput();
    createdSlugs.push(input.tenantSlug);
    const result = await provisionTenant(db.db, input);

    await expect(withTenantContext(db.db, result.tenant.id, (tx) => tx.insert(schools).values({
      tenantId: result.tenant.id,
      name: 'Duplicate school',
      code: input.schoolCode,
      timezone: input.timezone,
      currency: input.currency,
    }))).rejects.toMatchObject({ cause: { code: '23505' } });

    const rows = await withTenantContext(db.db, result.tenant.id, (tx) =>
      tx.select({ id: schools.id }).from(schools).where(eq(schools.code, input.schoolCode)),
    );
    expect(rows).toHaveLength(1);
  });

  it('rolls back the tenant when insertion of the initial school fails', async () => {
    const input = makeInput();
    input.schoolName = 'Forced school insert failure';
    createdSlugs.push(input.tenantSlug);
    const suffix = randomUUID().replaceAll('-', '');
    const functionName = `cl_test_fail_school_${suffix}`;
    const triggerName = `cl_test_fail_school_${suffix}`;

    await admin.unsafe(`
      create function public.${functionName}() returns trigger
      language plpgsql as $body$
      begin
        if new.name = 'Forced school insert failure' then
          raise exception 'forced school insert failure';
        end if;
        return new;
      end;
      $body$
    `);
    await admin.unsafe(`
      create trigger ${triggerName} before insert on public.schools
      for each row execute function public.${functionName}()
    `);

    let caught: unknown;
    try {
      await provisionTenant(db.db, input);
    } catch (error) {
      caught = error;
    } finally {
      await admin.unsafe(`drop trigger if exists ${triggerName} on public.schools`);
      await admin.unsafe(`drop function if exists public.${functionName}()`);
    }

    expect((caught as Error | undefined)?.cause).toMatchObject({ message: 'forced school insert failure' });
    const tenants = await admin<{ id: string }[]>`select id from tenants where slug = ${input.tenantSlug}`;
    expect(tenants).toEqual([]);
  });
});

function makeInput() {
  const suffix = randomUUID().slice(0, 8);
  return {
    tenantName: `Tenant ${suffix}`,
    tenantSlug: `tenant-${suffix}`,
    schoolName: `School ${suffix}`,
    schoolCode: `SCHOOL-${suffix}`,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  };
}
