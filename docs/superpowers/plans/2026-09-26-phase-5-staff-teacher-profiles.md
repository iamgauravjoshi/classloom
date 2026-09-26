# Phase 5 Staff and Teacher Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tenant-safe staff directory and teacher profiles, with optional account links and eligible academic assignments.

**Architecture:** A People module owns tenant-wide staff identity and school affiliations. It exposes a transaction-aware teacher eligibility contract to Academics, while the web app uses a same-origin proxy and the existing ClassLoom shell. All tenant-owned tables use forced RLS and composite keys.

**Tech Stack:** pnpm monorepo; PostgreSQL, Drizzle, NestJS, Zod, Next.js 16, React 19, Tailwind 4, shadcn Base UI, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-26-phase-5-staff-teacher-profiles-design.md`

## Global Constraints

- Use `phase-5-staff-teacher-profiles` without a `codex/` branch prefix.
- Keep profiles distinct from login accounts. Do not add public account or invitation creation.
- Keep existing academic assignment membership IDs and historical rows intact.
- Require an active linked teacher affiliation, membership, account, and school grant for new assignments.
- Use authenticated tenant context, forced RLS, composite tenant foreign keys, and API-side school permissions.
- Use shadcn's existing `base-nova` Base UI components, the shadcn MCP for registry inspection, and no Radix or unrelated UI library.
- Follow `apps/web/AGENTS.md`: read installed Next.js documentation before React changes and apply `vercel-react-best-practices`.
- Use TDD for each behavior change; commit each independently tested task.

## Review Focus

- Duplicate staff code with case/whitespace differences must return a useful conflict, without creating a second person (Task 2).
- A staff manager for only one of a person's schools must not change shared profile, teacher, or account-link data (Task 3).
- An account loses teacher eligibility immediately when its affiliation, membership, account, or school grant is disabled (Task 5).
- Existing academic assignments to unprofiled accounts must remain visible and labeled after teacher pickers switch to profiles (Task 5).
- A cross-tenant staff ID, school ID, or membership ID must never disclose or attach another tenant's data (Tasks 1, 3, 4).

---

### Task 1: Schema, authorization catalog, and migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/authorization-catalog.ts`
- Create: `packages/db/src/staff-schema.integration.spec.ts`
- Create: generated migration and snapshot in `packages/db/drizzle/`; append any required permission backfill and runtime grants to that new migration
- Test: `packages/db/src/authorization-catalog.spec.ts`, `packages/db/src/authorization-seeding.spec.ts`

**Interfaces:**
- Produces: `staffProfiles`, `staffSchoolAffiliations`, and `teacherProfiles` Drizzle tables, and `staff.read` / `staff.manage` catalog keys.
- `staff_profiles`: `id`, `tenantId`, `staffCode`, `givenName`, `familyName`, `preferredName`, `workEmail`, `phone`, `membershipId`, timestamps; case-insensitive unique `(tenantId, upper(trim(staffCode)))` and unique non-null `(tenantId, membershipId)`.
- `staff_school_affiliations`: `id`, `tenantId`, `staffId`, `schoolId`, `designation`, `startDate`, `kind`, `status`, timestamps; unique `(tenantId, staffId, schoolId)`.
- `teacher_profiles`: `staffId`, `tenantId`, `qualification`, `specialization`, timestamps; one record per staff profile.

- [ ] **Step 1: Write failing schema and catalog tests.** Assert tenant-scoped uniqueness, cross-tenant school and membership FK rejection, runtime reads without tenant context return no rows, and built-in role templates contain the new permission keys with the exact roles in the spec.
- [ ] **Step 2: Run red tests.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test -- staff-schema.integration.spec.ts authorization-catalog.spec.ts`; expect missing tables or permissions.
- [ ] **Step 3: Add schema and catalog entries.** Add status/kind checks, composite FKs, indexes, forced tenant RLS policies, and role template entries. Do not change existing academic assignment schema.
- [ ] **Step 4: Generate and inspect migration.** Run `pnpm db:generate`; inspect the new SQL/snapshot, add `FORCE ROW LEVEL SECURITY`, restricted runtime grants, permission catalog insert, and existing built-in role grant backfill in the generated migration.
- [ ] **Step 5: Migrate and run green tests.** Run `pnpm db:migrate`, the focused DB tests, `pnpm --filter @classloom/db typecheck`, and `pnpm --filter @classloom/db build`; expect exit 0 and no skipped DB test due to absent URLs.
- [ ] **Step 6: Commit.** Commit schema, catalog, tests, and the new migration together as `feat: add staff profile schema and permissions`.

### Task 2: Staff directory and creation persistence

**Files:**
- Create: `packages/db/src/staff.ts`
- Create: `packages/db/src/staff.spec.ts`
- Create: `packages/db/src/staff.integration.spec.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `StaffScope = { tenantId: string; schoolId: string }`, `StaffCreateInput`, `StaffListFilters`, `StaffListPage`, `createStaffProfile(tx: TenantTransaction, scope: StaffScope, input: StaffCreateInput, audit: { actorAccountId: string; requestId?: string })`, `listSchoolStaff(tx, scope, filters)`, `readSchoolStaff(tx, scope, staffId)`, and `StaffError` with `NOT_FOUND | CONFLICT | INVALID` codes.
- `StaffCreateInput` separates `profile`, `affiliation`, and optional `teacher` fields; creation writes all provided records and the audit event atomically. Listing returns only the selected school's affiliations, ordered by normalized name then ID, with bounded cursor pagination.

- [ ] **Step 1: Write failing unit tests.** Assert `normalizeStaffCode(' ab-12 ') === 'AB-12'`, reject invalid codes, trim names, and bound `limit` to 1–100 with 25 default.
- [ ] **Step 2: Run red unit tests.** Run `pnpm --filter @classloom/db test -- staff.spec.ts`; expect missing exports.
- [ ] **Step 3: Implement normalization and directory interfaces.** Use the new schema tables and `TenantTransaction` only; keep HTTP and permission checks out of this package.
- [ ] **Step 4: Write failing integration tests.** Assert creation with teacher details is visible at its school, a second tenant may use the same staff code, same-tenant case variant conflicts, another school's list excludes it, and rollback removes both profile and audit event on invalid affiliation.
- [ ] **Step 5: Run red integration tests.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test -- staff.integration.spec.ts`; expect failures.
- [ ] **Step 6: Implement create, list, and detail functions.** Use composite identifiers, no cross-tenant query path, and a stable cursor. Map database uniqueness to a domain `StaffError` with `CONFLICT` and a specific message.
- [ ] **Step 7: Run green DB tests and commit.** Run focused tests and DB typecheck; commit as `feat: add staff directory persistence`.

### Task 3: Affiliation, teacher, and account-link rules

**Files:**
- Modify: `packages/db/src/staff.ts`
- Modify: `packages/db/src/staff.integration.spec.ts`
- Create: `apps/api/src/people/people.service.ts`
- Create: `apps/api/src/people/people.service.spec.ts`

**Interfaces:**
- Produces: `updateStaffProfile`, `updateStaffAffiliation`, `addStaffAffiliation`, `upsertTeacherProfile`, `linkStaffMembership`, `unlinkStaffMembership`, `listEligibleStaffAccounts`, and `isAssignableTeacher(tx, scope, membershipId)` persistence operations; each mutator receives actor ID/request ID for an atomic audit event.
- Produces: `PeopleService` methods that check `staff.read` / `staff.manage` on the requested school using `AuthorizationService`; shared profile/teacher/account edits check `staff.manage` on every affiliated school. Detail responses expose `canEditShared: boolean` for UI controls. `canAssignTeacher(tx, scope, membershipId): Promise<boolean>` is the Academics-facing contract.

- [ ] **Step 1: Write failing service tests.** Assert a one-school manager may edit only that affiliation, a manager of all affiliations may edit shared fields, and missing permission fails closed.
- [ ] **Step 2: Run red service tests.** Run `pnpm --filter @classloom/api test -- people.service.spec.ts`; expect missing service.
- [ ] **Step 3: Implement the People service authorization boundary.** Use the current session context and `AuthorizationService`; enforce source read and target manage for a new affiliation.
- [ ] **Step 4: Write failing DB integration tests.** Assert a teacher affiliation needs a teacher record; duplicate affiliation and linked membership conflict; an account without an active matching school grant cannot link; assignment-backed links cannot be changed; inactivation preserves profile/history; cross-tenant IDs fail; audit rows appear only with committed mutations.
- [ ] **Step 5: Run red DB integration tests.** Run the focused staff integration suite with `.env`; expect failures.
- [ ] **Step 6: Implement mutators and eligibility.** Keep shared-field edits and membership checks under one tenant transaction; recheck active account, membership, and grant when `isAssignableTeacher` runs.
- [ ] **Step 7: Run green suites and commit.** Run focused API and DB tests plus both typechecks; commit as `feat: enforce staff lifecycle and teacher eligibility`.

### Task 4: People API and error contracts

**Files:**
- Create: `apps/api/src/people/people.controller.ts`
- Create: `apps/api/src/people/people.module.ts`
- Create: `apps/api/src/people/people.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces the REST routes in the spec under `/api/v1/people/schools/:schoolId/`, plus `GET /api/v1/people/schools` filtered by `staff.read`, with Zod schemas and `parseRequest` field errors. All mutations use `AuthGuard` and `CsrfGuard`; reads use `AuthGuard`.
- `PeopleModule` exports `PeopleService`; controllers map `StaffError` to 404/409/400 and never return raw SQL errors.

- [ ] **Step 1: Write failing E2E tests.** Assert 401 without a session, 403 for a member without `staff.read`, 403 without CSRF on writes, 400 with `details.fields.givenName` for a short name, 409 for duplicate code, school-scoped list/filter results, `GET /people/schools` includes only schools with `staff.read`, and 403/404 for foreign school/tenant references.
- [ ] **Step 2: Run red API E2E.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test:e2e -- people.e2e-spec.ts`; expect missing routes.
- [ ] **Step 3: Implement People controller and module.** Use `request.auth` for tenant/member IDs, school permission checks from the service, `withTenantContext` around each data operation, and strict, bounded request schemas.
- [ ] **Step 4: Extend E2E for lifecycle.** Assert profile edit, second-school affiliation, teacher promotion, eligible accounts, link/unlink, inactive status, and global-edit denial when the actor manages only one affiliated school.
- [ ] **Step 5: Run green E2E, API unit tests, lint, and typecheck.** Expect exit 0; commit as `feat: expose staff and teacher API`.

### Task 5: Academic assignment integration

**Files:**
- Modify: `apps/api/src/academics/academics.controller.ts`
- Modify: `apps/api/src/academics/academics.module.ts`
- Modify: `packages/db/src/academics.ts`
- Modify: `apps/api/src/academics/academics.e2e-spec.ts`

**Interfaces:**
- Consumes: `PeopleService.canAssignTeacher(tx, { tenantId, schoolId }, membershipId)` from Task 3.
- Produces: the existing `GET /academics/schools/:schoolId/staff` shape (`id`, `email`, `displayName`) restricted to eligible linked teachers for new selection, and an `assignmentAccounts` array in `GET .../setup` containing (`id`, `email`, `displayName`) for every historical assignment membership, including inactive or unprofiled ones.

- [ ] **Step 1: Write failing academic E2E tests.** Assert a new assignment to an unlinked account is rejected with a teacher-specific message; linked active teacher succeeds; disabling affiliation/account/membership/grant rejects the next assignment; a pre-Phase-5 assignment still appears in setup with a readable account label.
- [ ] **Step 2: Run red E2E.** Run focused academic E2E with `.env`; expect unlinked accounts still accepted.
- [ ] **Step 3: Inject People service into Academics.** Call the eligibility contract inside the existing `withTenantContext` transaction before inserting a new assignment; keep existing academic validation and membership FK.
- [ ] **Step 4: Update picker response and historical label fallback.** Return only eligible profile-linked members for new assignment, and use `assignmentAccounts` to label old rows without making them selectable.
- [ ] **Step 5: Run green academic and People E2E, typecheck, lint.** Expect exit 0; commit as `feat: assign only linked active teachers`.

### Task 6: Staff and teacher web UI

**Files:**
- Create: `apps/web/src/lib/staff-api.ts`
- Create: `apps/web/src/lib/staff-api.test.ts`
- Create: `apps/web/src/app/api/people/[...path]/route.ts`
- Create: `apps/web/src/app/staff/page.tsx`
- Create: `apps/web/src/app/staff/staff-client.tsx`
- Create: `apps/web/src/app/staff/staff-form.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/academic-setup/setup-client.tsx`
- Modify: `apps/web/src/lib/navigation.ts` if its upcoming Teachers entry must become a live route

**Interfaces:**
- Consumes: People API routes from Task 4 and eligible teacher response from Task 5.
- Produces: a protected `/staff` directory with school selection, search/filter/pagination, profile view, creation/editing, affiliation/teacher/account actions, and clear loading/empty/error/success states.

- [ ] **Step 1: Read local Next.js 16 docs and Vercel React skill.** Follow `apps/web/AGENTS.md`; inspect installed shadcn components and use shadcn MCP examples for any composition. If a required component is absent, search the registry, preview the project-aware CLI addition, and add only its Base UI version.
- [ ] **Step 2: Write failing web helper tests.** Assert request URL/filter encoding, CSRF header on mutations, and field-error preservation through `responseError`.
- [ ] **Step 3: Run red web tests.** Run `pnpm --filter @classloom/web test -- staff-api.test.ts`; expect missing helper.
- [ ] **Step 4: Implement client and allowlisted proxy.** Mirror academic proxy's body size and cookie forwarding; allow only declared GET/POST/PATCH/PUT/DELETE paths; never expose internal API URL to the browser.
- [ ] **Step 5: Implement page and forms with installed shadcn Base UI controls.** Use `Field`, `Input`, `Select`, `Dialog`, `Card`, `Table`, `Badge`, `Alert`, `Skeleton`, `Button`, and `Toast`; use the existing date field for optional start date. Keep shared fields read-only unless the API reports all-school manage access. Make the Teachers sidebar item route to `/staff`.
- [ ] **Step 6: Update academic setup teacher labels.** Remove the Phase 5 placeholder copy; show linked teacher names and a historical account fallback. Retain dependent selection clearing.
- [ ] **Step 7: Run green web tests, lint, typecheck, and build.** Check keyboard/labels and light/dark contrast by viewing the page; capture a UI screenshot for PR review. Commit as `feat: add staff and teacher directory UI`.

### Task 7: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/module-boundaries.md`
- Modify: `docs/architecture/identity-and-access.md`
- Modify: `docs/architecture/multi-tenancy.md`
- Create: `docs/development/staff-teachers.md`
- Create: `docs/decisions/NNNN-shared-staff-profiles.md` using the next ADR number

**Interfaces:** No new runtime interface. Documents the delivered workflow, account-link limits, permissions, and migration requirements.

- [ ] **Step 1: Update documentation and ADR.** Explain profile versus login account, multi-school affiliations, teacher eligibility, endpoints, UI workflow, and local setup; keep README links current.
- [ ] **Step 2: Run full verification.** Run `pnpm db:check`, `pnpm lint`, `pnpm typecheck`, `pnpm exec dotenv -e .env -- pnpm test`, `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test:e2e`, and `pnpm build`; inspect migration SQL and `git diff --check`. Report any database or environment blocker accurately.
- [ ] **Step 3: Review branch and commit docs.** Inspect the complete diff against `main`, confirm no secrets or Radix dependencies, commit as `docs: document staff and teacher workflows`, and prepare a PR summary with verification and screenshots.
