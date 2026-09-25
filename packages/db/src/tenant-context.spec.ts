import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb } from './client.js';
import * as dbExports from './index.js';
import { withTenantContext } from './tenant-context.js';
import { campuses, schools } from './schema.js';

const databaseUrl = process.env.DATABASE_URL;
const adminUrl = process.env.DATABASE_MIGRATION_URL;
const integrationEnabled = Boolean(databaseUrl && adminUrl);

describe('withTenantContext', () => {
  it('exports tenant context through the database package entrypoint', () => {
    expect(dbExports).toHaveProperty('withTenantContext');
  });

  it('rejects malformed UUIDs before calling tenant work', async () => {
    let called = false;
    const db = { transaction: () => { throw new Error('transaction should not start'); } } as never;

    await expect(withTenantContext(db, 'not-a-uuid', async () => {
      called = true;
    })).rejects.toThrow('tenantId must be a valid UUID');
    expect(called).toBe(false);
  });

  it.skipIf(!integrationEnabled)(
    'limits reads and writes to the active tenant, including direct IDs',
    async () => {
      const fixture = await makeFixture();
      const ownRows = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.select({ id: schools.id, tenantId: schools.tenantId }).from(schools),
      );
      expect(ownRows).toEqual([{ id: fixture.schoolA, tenantId: fixture.tenantA }]);

      const ownCampuses = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.select({ id: campuses.id, tenantId: campuses.tenantId }).from(campuses),
      );
      expect(ownCampuses).toEqual([{ id: fixture.campusA, tenantId: fixture.tenantA }]);

      const directLookup = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.select().from(schools).where(eq(schools.id, fixture.schoolB)),
      );
      expect(directLookup).toEqual([]);

      const directCampusLookup = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.select().from(campuses).where(eq(campuses.id, fixture.campusB)),
      );
      expect(directCampusLookup).toEqual([]);

      const updateOther = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.update(schools).set({ name: 'changed by tenant A' })
          .where(eq(schools.id, fixture.schoolB)).returning(),
      );
      expect(updateOther).toEqual([]);

      const deleteOther = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.delete(schools).where(eq(schools.id, fixture.schoolB)).returning(),
      );
      expect(deleteOther).toEqual([]);

      const updateOtherCampus = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.update(campuses).set({ name: 'changed by tenant A' })
          .where(eq(campuses.id, fixture.campusB)).returning(),
      );
      expect(updateOtherCampus).toEqual([]);

      const deleteOtherCampus = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.delete(campuses).where(eq(campuses.id, fixture.campusB)).returning(),
      );
      expect(deleteOtherCampus).toEqual([]);

      const updateTenantId = withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.update(schools).set({ tenantId: fixture.tenantB })
          .where(eq(schools.id, fixture.schoolA)).returning(),
      );
      await expect(updateTenantId).rejects.toMatchObject({ cause: { code: '42501' } });

      const insertOther = withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.insert(schools).values({
          tenantId: fixture.tenantB,
          name: 'forged school',
          code: `FORGED-${fixture.suffix}`,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
        }),
      );
      await expect(insertOther).rejects.toMatchObject({ cause: { code: '42501' } });

      const updateCampusTenantId = withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.update(campuses).set({ tenantId: fixture.tenantB })
          .where(eq(campuses.id, fixture.campusA)).returning(),
      );
      await expect(updateCampusTenantId).rejects.toMatchObject({ cause: { code: '42501' } });

      const insertOtherCampus = withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.insert(campuses).values({
          tenantId: fixture.tenantB,
          schoolId: fixture.schoolB,
          name: 'forged campus',
          code: `FORGED-CAMPUS-${fixture.suffix}`,
        }),
      );
      await expect(insertOtherCampus).rejects.toMatchObject({ cause: { code: '42501' } });

      const insertedSchool = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.insert(schools).values({
          tenantId: fixture.tenantA,
          name: 'Runtime inserted school',
          code: `RUNTIME-${fixture.suffix}`,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
        }).returning({ id: schools.id }),
      );
      expect(insertedSchool).toHaveLength(1);

      const insertedCampus = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.insert(campuses).values({
          tenantId: fixture.tenantA,
          schoolId: fixture.schoolA,
          name: 'Runtime inserted campus',
          code: `RUNTIME-CAMPUS-${fixture.suffix}`,
        }).returning({ id: campuses.id }),
      );
      expect(insertedCampus).toHaveLength(1);

      const ownUpdate = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.update(schools).set({ name: 'Tenant A school updated' })
          .where(eq(schools.id, fixture.schoolA)).returning({ name: schools.name }),
      );
      expect(ownUpdate).toEqual([{ name: 'Tenant A school updated' }]);

      const ownCampusUpdate = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.update(campuses).set({ name: 'Tenant A campus updated' })
          .where(eq(campuses.id, fixture.campusA)).returning({ name: campuses.name }),
      );
      expect(ownCampusUpdate).toEqual([{ name: 'Tenant A campus updated' }]);
    },
  );

  it.skipIf(!integrationEnabled)(
    'hides tenant-owned rows and rejects writes when no context is set',
    async () => {
      const fixture = await makeFixture();

      expect(await runtime!.db.select().from(schools)).toEqual([]);
      expect(await runtime!.db.select().from(campuses)).toEqual([]);

      await expect(runtime!.db.insert(schools).values({
        tenantId: fixture.tenantA,
        name: 'unscoped school',
        code: `UNSCOPED-${fixture.suffix}`,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
      })).rejects.toMatchObject({ cause: { code: '42501' } });

      await expect(runtime!.db.insert(campuses).values({
        tenantId: fixture.tenantA,
        schoolId: fixture.schoolA,
        name: 'unscoped campus',
        code: `UNSCOPED-CAMPUS-${fixture.suffix}`,
      })).rejects.toMatchObject({ cause: { code: '42501' } });
    },
  );

  it.skipIf(!integrationEnabled)(
    'does not leak tenant context between transactions on a single pooled connection',
    async () => {
      const fixture = await makeFixture();
      const tenantRows = await withTenantContext(runtime!.db, fixture.tenantA, (tx) =>
        tx.select({ id: schools.id }).from(schools),
      );
      expect(tenantRows).toHaveLength(1);

      expect(await runtime!.db.select().from(schools)).toEqual([]);
    },
  );

  it.skipIf(!integrationEnabled)(
    'rejects a campus whose tenant and school belong to different tenants',
    async () => {
      const fixture = await makeFixture();
      await expect(admin!`
        insert into campuses (tenant_id, school_id, name, code)
        values (${fixture.tenantA}, ${fixture.schoolB}, 'cross-tenant campus', 'CROSS')
      `).rejects.toMatchObject({ code: '23503' });
    },
  );
});

let admin: ReturnType<typeof postgres> | undefined;
let runtimeVerifier: ReturnType<typeof postgres> | undefined;
let runtime: ReturnType<typeof createDb> | undefined;
const fixtures: Array<{ tenantA: string; tenantB: string }> = [];

beforeAll(async () => {
  if (!integrationEnabled) return;
  admin = postgres(adminUrl!, { max: 1 });
  runtimeVerifier = postgres(databaseUrl!, { max: 1 });
  runtime = createDb(databaseUrl!, { maxConnections: 1 });
});

it.skipIf(!integrationEnabled)('connects through a non-owner runtime role', async () => {
  const [role] = await runtimeVerifier!<{ role: string; superuser: boolean; bypass_rls: boolean; owns_tenant_tables: boolean }[]>`
    select r.rolname as role,
      r.rolsuper as superuser,
      r.rolbypassrls as bypass_rls,
      exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = current_schema()
          and c.relname in ('schools', 'campuses')
          and c.relowner = r.oid
      ) as owns_tenant_tables
    from pg_roles r
    where r.rolname = current_user
  `;

  expect(role).toBeDefined();
  expect(role).toMatchObject({ superuser: false, bypass_rls: false, owns_tenant_tables: false });
});

afterAll(async () => {
  if (admin) {
    for (const fixture of fixtures) {
      await admin`delete from tenants where id in (${fixture.tenantA}, ${fixture.tenantB})`;
    }
    await admin.end();
  }
  await runtimeVerifier?.end();
  await runtime?.close();
});

async function makeFixture() {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const schoolA = randomUUID();
  const schoolB = randomUUID();
  const campusA = randomUUID();
  const campusB = randomUUID();
  const suffix = tenantA.slice(0, 8);
  fixtures.push({ tenantA, tenantB });

  await admin!`
    insert into tenants (id, name, slug) values
      (${tenantA}, 'Tenant A', ${`tenant-a-${suffix}`}),
      (${tenantB}, 'Tenant B', ${`tenant-b-${suffix}`})
  `;
  await withTenantContext(runtime!.db, tenantA, (tx) => tx.insert(schools).values({
    id: schoolA,
    tenantId: tenantA,
    name: 'School A',
    code: `SCHOOL-A-${suffix}`,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  }));
  await withTenantContext(runtime!.db, tenantB, (tx) => tx.insert(schools).values({
    id: schoolB,
    tenantId: tenantB,
    name: 'School B',
    code: `SCHOOL-B-${suffix}`,
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  }));
  await withTenantContext(runtime!.db, tenantA, (tx) => tx.insert(campuses).values({
    id: campusA,
    tenantId: tenantA,
    schoolId: schoolA,
    name: 'Campus A',
    code: `CAMPUS-A-${suffix}`,
  }));
  await withTenantContext(runtime!.db, tenantB, (tx) => tx.insert(campuses).values({
    id: campusB,
    tenantId: tenantB,
    schoolId: schoolB,
    name: 'Campus B',
    code: `CAMPUS-B-${suffix}`,
  }));

  return { tenantA, tenantB, schoolA, schoolB, campusA, campusB, suffix };
}
