# Phase 3 Authorization Roles and Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tenant-aware role and permission administration with API enforcement, scoped membership grants, trusted first-administrator bootstrap, and audit records.

**Architecture:** Keep a system-owned permission catalog and tenant-owned immutable built-in role templates plus custom roles. Store role grants on memberships with tenant, school, or campus scope; resolve the tenant from the authenticated session and check authorization in Nest guards and services. PostgreSQL RLS and composite foreign keys remain the independent tenant-isolation boundary.

**Tech Stack:** Node.js 24.15+, pnpm 11.19, NestJS 12, TypeScript, Drizzle ORM, PostgreSQL 17, Vitest, and Supertest.

**Spec:** `docs/superpowers/specs/2026-09-25-phase-3-authorization-roles-permissions-design.md`

## Global Constraints

- Authorization uses default deny.
- Tenant ID, role, and scope never come from a client-controlled header or request body.
- Role assignments reference a membership and role from the same tenant using tenant-safe composite foreign keys.
- Scope hierarchy is tenant, school, and campus. Tenant scope includes all descendants; school scope includes its campuses; campus scope is limited to that campus.
- Academic and relationship assignments are denied until their domain modules provide authoritative resource resolvers.
- The permission catalog is application-owned; custom roles can use only catalog permissions and cannot exceed the assigning administrator's grant ceiling.
- Role, mapping, and assignment tables use forced RLS and require `withTenantContext`.
- Invitation acceptance creates identity and membership only; it does not silently assign a role.
- Role mutation and its audit event succeed or fail atomically.
- The README rewrite staged before Phase 3 must be reviewed and committed on this feature branch before publishing or merging the branch.

## Review Focus

1. **Cross-tenant IDs in a role assignment:** foreign tenant membership, role, school, or campus IDs must fail in API validation and composite constraints; cover in DB and API integration tests.
2. **Scope inheritance:** tenant grants must cover tenant descendants, school grants its campuses, and campus grants only itself; cover in the DB-backed authorization service tests.
3. **Privilege escalation through custom roles:** custom roles and assignments cannot add permissions the acting administrator does not hold; cover in transaction-level tests.
4. **Last tenant administrator races:** concurrent revocations cannot leave the tenant without an active administrator; cover with two concurrent PostgreSQL mutations.
5. **Stale scope and membership status:** suspended membership and removed school/campus must not retain effective authorization; cover in repository checks and API E2E tests.

---

### Task 1: Define permission catalog and built-in role templates

**Files:**
- Create: `packages/db/src/authorization-catalog.ts`
- Create: `packages/db/src/authorization-catalog.spec.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Export `PERMISSION_CATALOG` with stable keys and required scope kinds.
- Export `BUILT_IN_ROLE_TEMPLATES`, each with `key`, `name`, and a list of permission keys.
- Export `PermissionKey` and `AuthorizationScopeKind` types.
- Initial role keys are `tenant_admin`, `school_admin`, `principal`, `teacher`, `attendance_operator`, `finance_operator`, and `auditor`.
- Permission families include authorization roles, memberships, attendance, marks/results, finance/payments, and reports.

- [ ] **Step 1: Write catalog tests first**

Test unique permission keys, role-template key uniqueness, all role permission references resolving to catalog keys, and the auditor containing only read permissions.

```ts
it('contains no permission key more than once', () => {
  const keys = PERMISSION_CATALOG.map((permission) => permission.key);
  expect(new Set(keys).size).toBe(keys.length);
});

it('defines built-in roles only from catalog permissions', () => {
  const keys = new Set(PERMISSION_CATALOG.map((permission) => permission.key));
  for (const role of BUILT_IN_ROLE_TEMPLATES) {
    expect(role.permissionKeys.every((key) => keys.has(key))).toBe(true);
  }
});
```

- [ ] **Step 2: Run the catalog test and confirm the missing-export failure**

Run: `pnpm --filter @classloom/db test -- src/authorization-catalog.spec.ts`
Expected: FAIL because the catalog module does not exist.

- [ ] **Step 3: Add typed permission and role catalogs**

Define each permission as `{ key, family, scopeKind, action, readOnly }`. Include explicit keys for role read/manage, membership read/invite/suspend, school read/manage, campus read/manage, attendance read/record, marks read/enter, results publish, finance read, payments record/adjust, and reports export. Use literal `as const` keys to derive `PermissionKey`. Define built-in templates with explicit permission-key arrays. Mark read operations separately so auditor permissions can be mechanically checked.

- [ ] **Step 4: Run DB unit tests and commit**

Run: `pnpm --filter @classloom/db test -- src/authorization-catalog.spec.ts`
Expected: PASS, all catalog references are valid and auditor permissions are read-only.

```bash
git add packages/db/src/authorization-catalog.ts packages/db/src/authorization-catalog.spec.ts packages/db/src/index.ts
git commit -m "feat(authz): define permission catalog and role templates"
```

### Task 2: Add authorization schema and migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/authorization-schema.spec.ts`
- Create: generated migration and snapshot files under `packages/db/drizzle/`
- Modify: `packages/db/drizzle/meta/_journal.json`

**Interfaces:**
- Add `permissions` as an application-owned global catalog table.
- Add tenant-owned `authorization_roles`, `authorization_role_permissions`, and `membership_role_assignments` Drizzle tables.
- Built-in roles have a non-null `system_key`; custom roles have `system_key = null` and a tenant-unique name/key.
- Assignment scope fields are `scope_kind`, nullable `school_id`, and nullable `campus_id`, with a check constraint for tenant/school/campus shapes.
- Composite FKs bind role, membership, school, and campus to the same tenant.

- [ ] **Step 1: Write schema contract tests**

Test the four tables, uniqueness constraints, composite FKs, scope check constraint, forced RLS on all tenant-owned authorization tables, and no RLS requirement on the read-only global permission catalog.

```ts
it('rejects a campus role assignment without its matching school', async () => {
  await expect(insertCampusAssignment({ tenantId, membershipId, roleId, campusId, schoolId: null }))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run the schema test and confirm it fails for missing authorization schema**

Run: `pnpm --filter @classloom/db test -- src/authorization-schema.spec.ts`
Expected: FAIL because authorization tables and constraints do not exist.

- [ ] **Step 3: Define tables, RLS policies, indexes, and grants**

Use `tenant_id` on every tenant-owned authorization row. Enable and force RLS with the same transaction-local tenant policy used by Phase 1. Give the runtime role catalog SELECT only and only the tenant-table grants required for policy-checked API operations.

- [ ] **Step 4: Generate and inspect the migration**

Run: `pnpm db:generate`
Expected: one forward-only migration adds authorization tables, constraints, RLS policies, grants, and indexes without rewriting earlier migration history.

- [ ] **Step 5: Run schema tests and commit**

Run: `pnpm --filter @classloom/db test -- src/authorization-schema.spec.ts`
Expected: PASS, including RLS enabled/forced and invalid-scope rejection.

```bash
git add packages/db/src/schema.ts packages/db/src/authorization-schema.spec.ts packages/db/drizzle
git commit -m "feat(db): add scoped authorization schema"
```

### Task 3: Seed permissions and tenant role templates

**Files:**
- Create: `packages/db/src/authorization-seeding.ts`
- Create: `packages/db/src/authorization-seeding.spec.ts`
- Modify: `packages/db/src/provisioning.ts`
- Modify: `packages/db/src/provisioning.spec.ts`
- Modify: generated migration and snapshot under `packages/db/drizzle/`

**Interfaces:**
- The migration inserts catalog entries and templates for existing tenants using stable catalog and role keys.
- `seedTenantAuthorization(tx, tenantId): Promise<void>` inserts built-in tenant roles and their permission mappings idempotently.
- `provisionTenant` creates the tenant, school, and built-in role templates in the same transaction.

- [ ] **Step 1: Write provisioning and idempotency tests**

Test new tenant provisioning creates all built-in roles, rerunning the seeder creates no duplicates, and migration seeding creates templates for tenants that already exist.

- [ ] **Step 2: Run focused tests and confirm they fail because tenant roles are not seeded**

Run: `pnpm --filter @classloom/db test -- src/authorization-seeding.spec.ts src/provisioning.spec.ts`
Expected: FAIL because the authorization seeder and tables are absent.

- [ ] **Step 3: Implement idempotent seed functions and provisioning integration**

Use `onConflictDoNothing` for stable system keys, then insert role-permission links from the catalog. Add forward-only SQL migration seed statements for permissions and existing tenant roles; keep new tenant creation and role seed in the same `provisionTenant` transaction.

- [ ] **Step 4: Run DB integration tests with the non-owner runtime connection**

Run: `pnpm --filter @classloom/db test -- src/authorization-seeding.spec.ts src/provisioning.spec.ts`
Expected: PASS against PostgreSQL with migration and runtime URLs configured; test existing-tenant migration seed and new tenant atomic provisioning.

- [ ] **Step 5: Commit the seed and provisioning behavior**

```bash
git add packages/db/src/authorization-seeding.ts packages/db/src/authorization-seeding.spec.ts packages/db/src/provisioning.ts packages/db/src/provisioning.spec.ts packages/db/drizzle
git commit -m "feat(db): seed tenant authorization roles"
```

### Task 4: Implement scoped authorization repositories

**Files:**
- Create: `packages/db/src/authorization-repository.ts`
- Create: `packages/db/src/authorization-repository.spec.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/setup-runtime-role.ts` and its tests if grants are enumerated explicitly

**Interfaces:**
- `AuthorizationScope` is `{ kind: 'tenant' } | { kind: 'school'; schoolId: string } | { kind: 'campus'; schoolId: string; campusId: string }`.
- `listMembershipAuthorizationGrants(db, { tenantId, accountId, membershipId })` returns only active membership grants with permission keys and scopes.
- `createCustomRole(tx, { tenantId, actorAccountId, actorMembershipId, key, name, permissionKeys })` rejects unknown permissions and permission keys outside the acting administrator's grant ceiling.
- `assignRole(tx, { tenantId, actorAccountId, actorMembershipId, membershipId, roleId, scope })` validates active membership, actor authority over the target scope, and all scope IDs under tenant context.
- `revokeRoleAssignment(tx, { tenantId, assignmentId, actorAccountId })` removes one assignment and records its audit event in the same transaction.
- `canAccessScope(grants, permissionKey, targetScope)` implements tenant > school > campus inheritance and returns false for unsupported kinds.

- [ ] **Step 1: Write scope inheritance and default-deny tests**

Cover tenant grant to tenant/school/campus targets, school grant to its campus targets, campus grant only to the same campus, unknown permissions, and unsupported academic/relationship targets.

```ts
it('does not let a campus assignment authorize a sibling campus', () => {
  expect(canAccessScope([campusGrant], 'attendance.read', siblingCampusScope)).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and confirm the authorization helper is missing**

Run: `pnpm --filter @classloom/db test -- src/authorization-repository.spec.ts`
Expected: FAIL because the authorization repository does not exist.

- [ ] **Step 3: Implement tenant-scoped reads and atomic mutation functions**

Run every tenant-owned lookup inside `withTenantContext`. Check membership ownership and active status before returning grants. Lock the tenant administrator assignment set before revocation and reject changes that would leave no active `tenant_admin` membership assignment.

- [ ] **Step 4: Run PostgreSQL authorization integration tests**

Test cross-tenant role/membership rejection, RLS with no tenant context, role permission union, administrator permission ceiling, invalid scope FK/check constraint, audit rollback, concurrent final-admin removal, and pooled connection reuse.

Run: `pnpm --filter @classloom/db test -- src/authorization-repository.spec.ts`
Expected: PASS using the `classloom_runtime` non-owner database role; all RLS and concurrency cases pass.

- [ ] **Step 5: Commit repository and DB boundary tests**

```bash
git add packages/db/src/authorization-repository.ts packages/db/src/authorization-repository.spec.ts packages/db/src/index.ts packages/db/src/setup-runtime-role.ts packages/db/src/setup-runtime-role.spec.ts
git commit -m "feat(db): enforce scoped role grants"
```

### Task 5: Add Nest permission metadata, guard, and policy service

**Files:**
- Create: `apps/api/src/authorization/authorization.constants.ts`
- Create: `apps/api/src/authorization/require-permissions.decorator.ts`
- Create: `apps/api/src/authorization/authorization.service.ts`
- Create: `apps/api/src/authorization/authorization.guard.ts`
- Create: `apps/api/src/authorization/authorization.service.spec.ts`
- Create: `apps/api/src/authorization/authorization.guard.spec.ts`
- Create: `apps/api/src/authorization/authorization.module.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Modify: `apps/api/src/auth/auth.types.ts` only if typed permission context belongs on the request

**Interfaces:**
- `@RequirePermissions(...keys: PermissionKey[])` attaches one or more catalog keys to a route.
- `AuthorizationService.hasPermissions(context, requiredKeys, targetScope?)` returns true only when every key is granted by the active membership in the target scope.
- `AuthorizationGuard` returns 403 for missing metadata context, missing permission, inactive membership, unsupported scope, or unknown permission; it never reads tenant ID from request input.
- Guard execution order on protected routes is `AuthGuard` then `AuthorizationGuard`.

- [ ] **Step 1: Write service tests for no permission, all-required permissions, and scope union**

Use a real `AuthorizationService` with an injected repository stub at the storage boundary. Verify unassigned accounts and unsupported scopes deny, all required keys must match, and eligible scoped grants permit access.

- [ ] **Step 2: Run focused API tests and confirm the decorator and guard are absent**

Run: `pnpm --filter @classloom/api test -- src/authorization/authorization.service.spec.ts src/authorization/authorization.guard.spec.ts`
Expected: FAIL because authorization provider files do not exist.

- [ ] **Step 3: Implement decorator, service, guard, and module wiring**

Read Nest `Reflector` metadata with method-level override semantics. Resolve `accountId`, `activeMembershipId`, and `tenantId` only from `request.auth`. If active membership or tenant context is absent, reject before repository lookup.

- [ ] **Step 4: Run API tests and typecheck**

Run: `pnpm --filter @classloom/api test -- src/authorization/authorization.service.spec.ts src/authorization/authorization.guard.spec.ts` and `pnpm --filter @classloom/api typecheck`
Expected: PASS, with no permission path defaulting to allow.

- [ ] **Step 5: Commit permission enforcement primitives**

```bash
git add apps/api/src/authorization apps/api/src/auth/auth.module.ts apps/api/src/auth/auth.types.ts
git commit -m "feat(authz): enforce permission guards"
```

### Task 6: Add authorized role administration APIs and trusted bootstrap CLI

**Files:**
- Create: `apps/api/src/authorization/authorization.controller.ts`
- Create: `apps/api/src/authorization/authorization.controller.spec.ts`
- Create: `apps/api/src/authorization/authorization.e2e-spec.ts`
- Create: `apps/api/src/authorization/bootstrap-admin.ts`
- Modify: `apps/api/src/authorization/authorization.module.ts`
- Modify: `apps/api/package.json`
- Modify: `docs/development/authentication.md`

**Interfaces:**
- `GET /api/v1/authorization/permissions` lists the catalog for the active tenant.
- `GET /api/v1/authorization/roles` lists built-in and custom roles with permission keys.
- `POST /api/v1/authorization/roles` creates a tenant custom role from known permission keys.
- `POST /api/v1/authorization/assignments` assigns an existing tenant role to an active membership at a validated tenant/school/campus scope.
- `GET /api/v1/authorization/assignments` lists tenant-scoped assignments with their role, member, scope, and permission keys.
- `DELETE /api/v1/authorization/assignments/:assignmentId` revokes an assignment.
- Role and assignment writes require `authorization.roles.manage`; list endpoints require `authorization.roles.read`.
- CLI: `pnpm --filter @classloom/api auth:bootstrap-admin -- <tenant-id> <email>` finds an existing active membership and grants its tenant-wide `tenant_admin` role. It logs no secrets and writes an audit event.

- [ ] **Step 1: Write endpoint tests for forbidden user and authorized tenant administrator**

Test a logged-in member with no `authorization.roles.read` receives 403, a tenant administrator can list roles, and the same administrator cannot list or assign roles in another tenant by supplying a foreign ID.

- [ ] **Step 2: Run E2E tests and confirm routes are not registered**

Run: `pnpm --filter @classloom/api test:e2e -- src/authorization/authorization.e2e-spec.ts`
Expected: FAIL because the authorization controller and routes do not exist.

- [ ] **Step 3: Implement controller validation and audit-backed role mutations**

Derive tenant/member/actor from `request.auth`; reject client-supplied `tenantId`; allow only catalog keys; validate assignment scope against the active tenant; return 404 for foreign-tenant role or assignment IDs. For a role assignment, recheck `authorization.roles.manage` over the requested target scope and verify every permission in the target role is within the actor membership's current grant ceiling. Keep mutation and audit event in one DB transaction.

- [ ] **Step 4: Implement trusted admin bootstrap and CLI configuration**

Require an existing active account membership in the specified tenant. Use the API runtime database connection and the tenant-scoped bootstrap repository operation; do not introduce a new privileged runtime credential. Grant only that tenant's built-in tenant administrator role at tenant scope. Make the operation idempotent, record a `tenant_admin_bootstrapped` audit event with a null actor account and an explicit trusted-bootstrap event type, parse `--` correctly, and never print credentials or tokens.

- [ ] **Step 5: Run API unit/E2E tests and commit**

Run: `pnpm --filter @classloom/api test`, `pnpm --filter @classloom/api test:e2e`, and `pnpm --filter @classloom/api typecheck`.
Expected: PASS; forbidden operations are rejected and all permitted changes remain tenant-bound and audited.

```bash
git add apps/api/src/authorization apps/api/package.json docs/development/authentication.md
git commit -m "feat(authz): add tenant role management API"
```

### Task 7: Verify full tenant isolation and authorization integration

**Files:**
- Modify: `packages/db/src/tenant-schema.spec.ts`
- Modify: `apps/api/src/auth/auth.e2e-spec.ts` only where fixtures need authorization templates
- Modify: `apps/api/src/authorization/authorization.e2e-spec.ts`
- Modify: `docs/architecture/identity-and-access.md`
- Modify: `docs/architecture/multi-tenancy.md`
- Modify: `docs/development/authentication.md`

- [ ] **Step 1: Add explicit cross-tenant, inactive membership, and administrator-race cases**

Exercise database-level composite FKs and RLS through the runtime role, then exercise API calls with authenticated users in two tenants. Confirm an inactive membership cannot authorize from a still-valid session.

- [ ] **Step 2: Run all DB and API integration suites**

Run: `pnpm --filter @classloom/db test` and `pnpm --filter @classloom/api test:e2e` with local PostgreSQL migration/runtime URLs configured.
Expected: PASS; all cross-tenant and default-deny checks hold.

- [ ] **Step 3: Update architecture and developer docs**

Document role scope hierarchy, bootstrap command prerequisites, permission decorator usage, API routes, audit behavior, and the requirement that academic/relationship scope resolvers fail closed until their modules exist.

- [ ] **Step 4: Run workspace lint, typecheck, tests, build, and migration check**

Run: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm db:generate`.
Expected: all commands pass; `pnpm db:generate` reports no uncommitted schema changes.

- [ ] **Step 5: Commit docs and final regression tests**

```bash
git add packages/db/src/tenant-schema.spec.ts apps/api/src/auth/auth.e2e-spec.ts apps/api/src/authorization/authorization.e2e-spec.ts docs/architecture/identity-and-access.md docs/architecture/multi-tenancy.md docs/development/authentication.md
git commit -m "test(authz): verify tenant authorization boundaries"
```

### Task 8: Review README rewrite and publish the complete Phase 3 branch

**Files:**
- Modify and commit: `README.md` (the user-staged rewrite)
- Review: all Phase 3 commits and migrations

- [ ] **Step 1: Inspect the complete staged README diff**

Run: `git diff --cached -- README.md`
Expected: the staged diff contains only the requested current README rewrite and no environment secrets or unrelated generated data.

- [ ] **Step 2: Commit README as a separate Phase 3 documentation commit**

```bash
git commit -m "docs: refresh project README"
```

- [ ] **Step 3: Verify the implementation branch and staged README state**

Run: `git status --short --branch` and `git log --oneline --decorate -12`.
Expected: README is committed on `codex/phase-3-authorization-roles-permissions`, the branch includes all tested Phase 3 commits, and no unrelated file remains staged.

- [ ] **Step 4: Push the complete implementation branch and merge it to main**

Run: `git push -u origin codex/phase-3-authorization-roles-permissions`; update local `main` from `origin/main`; merge the feature branch into `main`; run the full verification suite on the merged result; then `git push origin main`.
Expected: GitHub `main` contains the Phase 3 implementation and README rewrite; feature and main refs resolve to the merged commit.

## Self-review

- Spec coverage: catalog and role templates (Tasks 1, 3); data model, constraints, and RLS (Tasks 2–4); API guard and default-deny (Task 5); admin APIs and trusted bootstrap (Task 6); audit and tenant isolation tests (Tasks 4, 6, 7); developer and architecture docs (Task 7); README and GitHub merge (Task 8).
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain. Test names, CLI syntax, route paths, permission keys, scope shapes, and command expectations are explicit.
- Type consistency: `AuthorizationScope`, `PermissionKey`, guard metadata, controller payloads, and repository inputs are introduced before their consumers. `tenantId`, `schoolId`, and `campusId` are never sourced from an untrusted tenant-selection field.
- Review Focus coverage: foreign IDs (Tasks 2, 4, 6, 7); scope inheritance (Task 4); privilege ceiling (Tasks 3, 4, 6); last-admin concurrency (Task 4); inactive membership and stale scopes (Tasks 4 and 7).
- Minor implementation check: before starting Task 2, confirm the installed Drizzle version supports the planned check constraints and forced-RLS schema helpers; use a raw SQL migration for unsupported policy/constraint details while keeping the Drizzle schema representation aligned.
