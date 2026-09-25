# Phase 1: SaaS and Tenant Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant, school, and campus foundations with transaction-scoped tenant context, forced PostgreSQL RLS, trusted provisioning, and integration evidence that tenant data stays isolated.

**Architecture:** `@classloom/db` owns schemas, migrations, tenant context, and trusted provisioning. The database runtime role is a non-owner, non-superuser without `BYPASSRLS`; migrations and provisioning use a separate privileged URL. No tenant selection or provisioning HTTP route is added before authentication.

**Tech Stack:** TypeScript, NestJS API shell (unchanged), Drizzle ORM/Kit, postgres.js, PostgreSQL 17, Vitest, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-09-25-phase-1-saas-tenant-foundation-design.md`

## Global Constraints

- “All entity primary keys use UUIDs.”
- “Schools and campuses have a required `tenant_id`.”
- “The setting is transaction-local so pooled connections cannot retain the previous request's tenant.”
- “The database runtime role must not be a superuser or have `BYPASSRLS`; migrations use a separate privileged role.”
- “No unauthenticated request may choose a tenant by sending an ID or slug.”
- Use Node.js `>=24.15.0` and pnpm `11.19.0` as declared in `package.json`.

## Review Focus

- Missing tenant setting: tenant-owned reads are empty and writes fail. Pin in Task 2 integration tests.
- Tenant ID supplied in inserted/updated row differs from transaction context: reject through `WITH CHECK`. Pin in Task 2 integration tests.
- Runtime URL connects as a table owner, superuser, or `BYPASSRLS` role: fail role checks / isolation tests. Pin in Task 1 role test and Task 2 integration setup.
- Provisioning conflicts or school insert failure after tenant insert: return a conflict or roll back both records. Pin in Task 3 tests.
- Tenant IDs contain malformed UUID input: reject before starting a transaction. Pin in Task 2 unit test.

---

### Task 1: Tenant schema, RLS migration, and database roles

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`
- Create: generated migration under `packages/db/drizzle/` and its snapshot/journal updates
- Create: `packages/db/src/setup-runtime-role.ts`
- Modify: `packages/db/package.json`
- Modify: root `package.json`
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/testing-strategy.md`
- Test: `packages/db/src/tenant-schema.spec.ts`

**Interfaces:**
- Consumes: existing `DATABASE_URL`, `packages/db/src/migrate.ts`, Drizzle schema export pattern.
- Produces: `tenants`, `schools`, and `campuses` table exports; `DATABASE_MIGRATION_URL` for schema operations; `DATABASE_PROVISIONER_URL` for the trusted provisioning CLI; `DATABASE_URL` as the limited runtime role; `DATABASE_RUNTIME_PASSWORD` for local/CI role setup.

- [ ] **Step 1: Write the failing schema contract test**

Create `packages/db/src/tenant-schema.spec.ts` with assertions that the exports exist and describe their required tenant, school, campus, code, and lifecycle columns. Add a PostgreSQL integration case, skipped only when `DATABASE_MIGRATION_URL` is absent, that checks a newly migrated database contains those three tables and the named RLS policies. Add a runtime-role case using `DATABASE_URL` that queries `pg_roles` and `pg_class` to prove `current_user` is neither superuser nor `BYPASSRLS` and does not own the schools or campuses tables.

- [ ] **Step 2: Run the focused test and record the expected failure**

Run: `pnpm --filter @classloom/db test -- src/tenant-schema.spec.ts`
Expected: FAIL because the tenant schema exports and database tables do not exist yet.

- [ ] **Step 3: Define UUID tables and tenant-safe constraints**

In `schema.ts`, define `tenants` (UUID PK, name, unique slug, status, timestamps), `schools` (UUID PK, non-null tenant FK, name, tenant-scoped code, timezone, currency, timestamps), and `campuses` (UUID PK, non-null tenant ID and school ID, name, school-scoped code, optional address fields, timestamps). Add unique `(tenant_id, id)` keys on both tenant-owned tables and a composite campus-to-school FK `(tenant_id, school_id) -> schools(tenant_id, id)`. Export all tables in `index.ts`.

- [ ] **Step 4: Generate and inspect the PostgreSQL migration**

Run: `pnpm db:generate`
Expected: Drizzle creates the schema migration and snapshot changes for the three tables and composite constraints. Inspect the generated SQL, then add explicit SQL statements in that migration for `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, tenant-match `USING` and `WITH CHECK` policies on schools/campuses, and minimum runtime-role grants. The policies must use `NULLIF(current_setting('app.tenant_id', true), '')::uuid` so absent context matches no rows.

- [ ] **Step 5: Add explicit runtime role provisioning**

Add an idempotent script that reads `DATABASE_MIGRATION_URL` and `DATABASE_RUNTIME_PASSWORD`, creates `classloom_runtime` with `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`, and grants database connect. Use safe SQL literal escaping for the password. Update `migrate.ts` to require `DATABASE_MIGRATION_URL`; keep `DATABASE_URL` reserved for runtime API connections. Add root and database package scripts named `db:setup-runtime-role` and `setup-runtime-role`.

- [ ] **Step 6: Wire local and CI configuration before tests**

Set `.env.example` to use `DATABASE_URL=postgresql://classloom_runtime:classloom_runtime_dev@localhost:5433/classloom`, `DATABASE_MIGRATION_URL=postgresql://classloom:classloom_dev@localhost:5433/classloom`, `DATABASE_PROVISIONER_URL=postgresql://classloom:classloom_dev@localhost:5433/classloom`, and the matching local `DATABASE_RUNTIME_PASSWORD`. In CI, define all three URLs and runtime password; run role setup and migration before `pnpm test`. Keep the final repeated migration command so idempotence remains checked.

- [ ] **Step 7: Run schema tests and type checks**

Run each command separately:

```powershell
pnpm db:setup-runtime-role
pnpm db:migrate
pnpm --filter @classloom/db test -- src/tenant-schema.spec.ts
```

Expected: role setup is idempotent, migration completes, schema contract test and role checks pass, and RLS is enabled and forced on both tenant-owned tables.

- [ ] **Step 8: Commit the schema boundary**

```bash
git add packages/db .env.example .github/workflows/ci.yml package.json docs/development
git commit -m "feat(db): add tenant schema and RLS policies"
```

### Task 2: Transaction-local tenant context and isolation tests

**Files:**
- Modify: `packages/db/src/client.ts`
- Create: `packages/db/src/tenant-context.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/src/tenant-context.spec.ts`
- Modify: `packages/db/src/tenant-schema.spec.ts` only if shared test helpers are needed

**Interfaces:**
- Consumes: Task 1 table exports and role setup; runtime DB URL and migration/admin URL.
- Produces: `withTenantContext<T>(db: AppDb, tenantId: string, work: (tx: TenantTransaction) => Promise<T>): Promise<T>`.

- [ ] **Step 1: Write tenant context validation tests**

In `tenant-context.spec.ts`, test that malformed UUID input rejects before invoking the callback, and valid UUID context invokes the callback with a transaction handle. Use `DATABASE_URL` and `DATABASE_MIGRATION_URL` to verify behavior against PostgreSQL.

- [ ] **Step 2: Run the focused test to see it fail**

Run: `pnpm --filter @classloom/db test -- src/tenant-context.spec.ts`
Expected: FAIL because `withTenantContext` is not exported.

- [ ] **Step 3: Implement transaction-local context**

Type `AppDb` from `createDb().db` and the transaction callback handle from its `transaction` method. Validate `tenantId` with a UUID parser before opening a transaction. Implement:

```ts
return db.transaction(async (tx) => {
  await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
  return work(tx);
});
```

Export the helper and types from `index.ts`.

- [ ] **Step 4: Add database isolation integration cases**

Using the migration/admin connection to seed two tenants, schools, and campuses, then the limited runtime connection inside `withTenantContext`, assert tenant A sees only its own records; direct UUID lookups for tenant B return no rows; update/delete of tenant B affect zero records; mismatched tenant inserts/updates fail; unscoped runtime reads return no rows while writes fail; and a campus insert pairing tenant A with tenant B's school fails its composite foreign key.

- [ ] **Step 5: Prove pooled transaction cleanup**

Configure the test runtime pool with `max: 1`. Run a tenant A transaction followed by an unscoped transaction on the same pool and assert the latter sees no schools. This pins the transaction-local `set_config` behavior under connection reuse.

- [ ] **Step 6: Verify focused integration tests**

Run: `pnpm --filter @classloom/db test -- src/tenant-context.spec.ts`
Expected: all tenant A/B, missing-context, mismatched-write, malformed-UUID, and connection-reuse cases pass with the non-superuser runtime role.

- [ ] **Step 7: Commit tenant context and isolation**

```bash
git add packages/db/src
git commit -m "feat(db): scope transactions to tenant context"
```

### Task 3: Atomic trusted tenant provisioning

**Files:**
- Create: `packages/db/src/provisioning.ts`
- Create: `packages/db/src/provision-tenant.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`
- Modify: root `package.json`
- Test: `packages/db/src/provisioning.spec.ts`

**Interfaces:**
- Consumes: Task 1 schemas and privileged `DATABASE_PROVISIONER_URL`; Task 2 transaction API where applicable.
- Produces: `provisionTenant(db: AppDb, input: { tenantName: string; tenantSlug: string; schoolName: string; schoolCode: string; timezone: string; currency: string }): Promise<{ tenant: typeof tenants.$inferSelect; school: typeof schools.$inferSelect }>` and a CLI command `pnpm db:provision-tenant -- --name ... --slug ... --school-name ... --school-code ... --timezone ... --currency ...`.

- [ ] **Step 1: Write provisioning tests first**

Test successful tenant and initial-school creation in one call, duplicate slug conflict, duplicate school-code conflict within a tenant, and rollback when the school insert fails after tenant insertion. For the rollback case, install a temporary test-only `BEFORE INSERT` trigger on campuses or schools that raises an exception, remove it in `finally`, and assert the tenant row was also rolled back. Assert database state after each failed case, not only the thrown error.

- [ ] **Step 2: Run the focused tests and record the expected failure**

Run: `pnpm --filter @classloom/db test -- src/provisioning.spec.ts`
Expected: FAIL because `provisionTenant` does not exist.

- [ ] **Step 3: Implement the transaction and conflict mapping**

Insert tenant and school in one transaction. Set transaction-local `app.tenant_id` to the newly generated tenant UUID before inserting the school so `FORCE ROW LEVEL SECURITY` also applies to the table owner. Let all failures roll back. Translate PostgreSQL unique violation code `23505` into a typed `ProvisioningConflictError`; rethrow other errors unchanged.

- [ ] **Step 4: Implement the trusted CLI boundary**

Require `DATABASE_PROVISIONER_URL`; parse six required CLI fields (`--name`, `--slug`, `--school-name`, `--school-code`, `--timezone`, and `--currency`); call `provisionTenant`; print the new tenant and school IDs on success; print a concise conflict message and nonzero exit code for invalid arguments or uniqueness conflicts. Do not add an HTTP controller or accept tenant choice from browser requests.

- [ ] **Step 5: Verify provisioning tests**

Run: `pnpm --filter @classloom/db test -- src/provisioning.spec.ts`
Expected: successful creation returns both rows; uniqueness errors map to conflicts; injected school failure leaves neither tenant nor school behind.

- [ ] **Step 6: Commit trusted provisioning**

```bash
git add packages/db package.json
git commit -m "feat(db): add trusted tenant provisioning"
```

### Task 4: Document tenant operation and complete workspace verification

**Files:**
- Modify: `docs/architecture/multi-tenancy.md`
- Modify: `docs/development/local-setup.md`
- Modify: `docs/development/testing-strategy.md`
- Modify: `.env.example` only if Task 1 surfaced a documentation gap

**Interfaces:**
- Consumes: Task 1 role names and environment variables; Task 2 tenant context helper; Task 3 provisioning CLI.
- Produces: current operating instructions for local provisioning and tenant-owned modules.

- [ ] **Step 1: Update the multi-tenancy contract**

Document `DATABASE_URL`, `DATABASE_MIGRATION_URL`, and `DATABASE_PROVISIONER_URL`; the tenant-local transaction helper; forced RLS policies; migration/runtime privilege separation; the trusted CLI; and the rule that future modules must include `tenant_id`, tenant-safe composite references, scoped data access, and RLS.

- [ ] **Step 2: Document local setup and test commands**

Update local setup to run `docker compose up -d db`, configure runtime/migration/provisioner URLs and the runtime password from `.env.example`, run `pnpm db:setup-runtime-role`, `pnpm db:migrate`, and use `pnpm db:provision-tenant -- --name "Demo School Group" --slug demo-school-group --school-name "Demo School" --school-code DEMO --timezone Asia/Kolkata --currency INR`. Explain that the privileged provisioning URL stays server-side and must not be exposed to the browser.

- [ ] **Step 3: Run final repository checks**

Run each command and inspect its full result:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm db:migrate
pnpm db:migrate
pnpm db:check
```

Expected: every command succeeds, both migration runs are repeatable, and PostgreSQL isolation tests execute with the non-superuser runtime role.

- [ ] **Step 4: Commit documentation and final checked state**

```bash
git add docs/architecture/multi-tenancy.md docs/development
git commit -m "docs: document tenant operations and isolation"
```

## Final review checklist

- Confirm every acceptance criterion in the spec maps to a task and test above.
- Confirm no public API route accepts a tenant ID or slug before Phase 2 authentication.
- Confirm migration/provisioning credentials are distinct from the API runtime URL.
- Confirm isolation tests use a role that is neither a superuser nor `BYPASSRLS`.
- Confirm CI creates the runtime role and migrates before integration tests.
