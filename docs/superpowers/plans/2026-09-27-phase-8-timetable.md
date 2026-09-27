# Phase 8 Timetable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a school-scoped weekly timetable that managers can edit and publish, readers can view by section or teacher, and local developers can populate with deterministic Faker data.

**Architecture:** Add Timetable-owned storage, conflict rules, API routes, and responsive web screens. Validate session, section, subject, and optional teacher-assignment references through an explicit Academics contract; preserve tenant RLS and serialize timetable writes on the parent row. Add a separate explicit Faker command for reserved demo subjects and slots.

**Tech Stack:** pnpm monorepo; PostgreSQL, Drizzle, forced RLS; NestJS, Zod, Vitest; Next.js 16 App Router, React, Tailwind CSS 4, shadcn Base UI; existing `@faker-js/faker` development dependency.

**Spec:** `docs/superpowers/specs/2026-09-27-phase-8-timetable-design.md`

## Global Constraints

- Tenant identity comes from the authenticated active membership; every tenant-owned operation uses `withTenantContext` and forced RLS.
- Timetable is school-scoped and validates Academic references through explicit application contracts rather than reading Academics tables as an implicit API.
- API permissions `timetable.read` and `timetable.manage` are authoritative; UI visibility is not an authorization boundary.
- Weekdays are Monday through Sunday; recurring slot times are school-local wall-clock times.
- Any edit to a published timetable returns it to draft; read-only users see published schedules only.
- Do not create user accounts, credentials, invitations, staff profiles, or non-demo records from the Faker seeder.
- Use existing shadcn Base UI components and semantic tokens; do not add Radix UI or unrelated UI libraries.
- The dev seeder requires explicit tenant, school, and session targets, is deterministic, and refuses production mode.

## Review Focus

- Adjacent slots are allowed, but partial overlap on the same section, teacher, or room is rejected; serialize concurrent writes so two simultaneous inserts cannot both pass.
- Foreign-tenant/school session, section, subject, and teacher assignment IDs return a safe not-found/validation response without leaking records.
- An unassigned slot is visible as such; an assigned slot requires an eligible Academic teacher assignment for the same section and subject.
- Editing a published schedule moves it to draft and hides it from readers until republished; failed publish leaves it in draft.
- Faker reruns reuse only reserved demo keys, preserve conflicting manual slots, and make no identity or credential writes.

---

### Task 1: Timetable schema and permission grants

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/authorization-catalog.ts`
- Modify: `packages/db/src/authorization-seeding.ts`
- Create: `packages/db/src/timetable-schema.spec.ts`
- Modify: `packages/db/src/authorization-catalog.spec.ts`
- Modify: `packages/db/src/authorization-seeding.spec.ts`
- Create: generated `packages/db/drizzle/0013_phase8_timetable.sql` and snapshot/journal updates

**Interfaces:**
- Add `weeklyTimetables`, `weeklyTimetableSlots`, and `weeklyTimetableEvents` Drizzle tables.
- Slot types: weekday integer 1–7, PostgreSQL local `time` start/end, section/subject IDs, nullable Academic teacher-assignment ID, nullable room label, nullable reserved demo key, creator/updater actor IDs.
- Add `timetable.read` and `timetable.manage`. Grant manage to tenant/school administrators; grant read to principal, teacher, and auditor templates.

- [ ] **Step 1: Write failing schema and permission tests.** Assert tenant-scoped parent uniqueness, composite slot references, forced RLS metadata, weekday/time/status constraints, demo-key uniqueness, and built-in role grants.
- [ ] **Step 2: Run the focused tests and confirm they fail.** Run `pnpm --filter @classloom/db test -- timetable-schema.spec.ts authorization-catalog.spec.ts authorization-seeding.spec.ts`.
- [ ] **Step 3: Implement schema and grants.** Add tables, foreign keys, indexes, checks, tenant policies, permission catalog rows, and role-template grants.
- [ ] **Step 4: Generate and review migration 0013.** Run `pnpm db:generate`; verify SQL enables and forces RLS, adds transaction-tenant policies and `classloom_runtime` grants, and backfills permissions for existing tenants without modifying prior migrations.
- [ ] **Step 5: Run focused tests and commit.** Verify schema/catalog/seed tests pass, then commit `feat(db): add timetable schema and permissions`.

### Task 2: Academic schedule options contract

**Files:**
- Modify: `apps/api/src/academics/academics.service.ts`
- Modify: `apps/api/src/academics/academics.service.spec.ts`
- Modify: `apps/api/src/academics/academics.module.ts`

**Interfaces:**
- Add `AcademicsService.listTimetableOptions(tx, scope, sessionId)`, returning `{ sections, subjects, teacherAssignments }`; sections include class labels and teacher assignments include membership IDs and display labels.
- Add `AcademicsService.requireTimetableAssignment(tx, scope, sessionId, sectionId, subjectId, assignmentId): Promise<void>`, which fails unless the assignment matches and the teacher remains eligible through `PeopleService`.

- [ ] **Step 1: Add failing service tests.** Cover empty options, session/school mismatch, assignment mismatch, and ineligible/disabled teacher rejection.
- [ ] **Step 2: Run `pnpm --filter @classloom/api test -- academics/academics.service.spec.ts` and confirm failure.**
- [ ] **Step 3: Implement the two narrow Academics contracts.** Keep People lookups behind `PeopleService`; return presentation-ready labels without exposing raw DB rows.
- [ ] **Step 4: Run the service tests and commit.** Commit `feat(academics): expose timetable setup contract`.

### Task 3: Timetable persistence and lifecycle service

**Files:**
- Create: `packages/db/src/timetable.ts`
- Create: `packages/db/src/timetable.spec.ts`
- Create: `packages/db/src/timetable.integration.spec.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/api/src/timetable/timetable.service.ts`
- Create: `apps/api/src/timetable/timetable.service.spec.ts`

**Interfaces:**
- `type TimetableScope = { tenantId: string; schoolId: string }`.
- `type TimetableSlotInput = { sessionId: string; sectionId: string; subjectId: string; teacherAssignmentId?: string | null; weekday: number; startTime: string; endTime: string; roomLabel?: string | null }`.
- Repository operations: `readWeeklyTimetable(tx, scope, sessionId, filters)`, `lockOrCreateWeeklyTimetable(tx, scope, sessionId, actor)`, `insertTimetableSlot(tx, scope, timetableId, input, actor)`, `updateTimetableSlot(tx, scope, slotId, input, actor)`, `deleteTimetableSlot(tx, scope, slotId, actor)`, and `publishWeeklyTimetable(tx, scope, timetableId, actor)`; all receive a tenant transaction and actor.
- `TimetableService` exposes `read(scope, sessionId, filters)`, `createSlot(actor, scope, input)`, `updateSlot(actor, scope, slotId, input)`, `deleteSlot(actor, scope, slotId)`, and `publish(actor, scope, sessionId)`; it owns overlap/reference validation and draft/published transitions.

- [ ] **Step 1: Write failing overlap/lifecycle unit tests.** Test same-section, teacher, and normalized-room conflicts; adjacency; invalid times/day; null teacher assignment; slot deletion; draft-to-published; edit-unpublishes; and audit-event atomicity.
- [ ] **Step 2: Run focused tests and confirm failure.** Run the database and API service test files created above.
- [ ] **Step 3: Implement repository and service operations.** Lock the parent timetable row inside each mutation transaction before conflict queries; write audit events with the same transaction; keep an absent read empty without inserting.
- [ ] **Step 4: Add DB integration tests.** Verify absent tenant context, cross-tenant and cross-school composite references, RLS, publication atomicity, and concurrent overlapping insert serialization.
- [ ] **Step 5: Run focused unit/integration suites and commit.** Commit `feat(timetable): add schedule lifecycle and conflict checks`.

### Task 4: Timetable API and same-origin proxy

**Files:**
- Create: `apps/api/src/timetable/timetable.controller.ts`
- Create: `apps/api/src/timetable/timetable.module.ts`
- Create: `apps/api/src/timetable/timetable.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/web/src/app/api/timetable/[...path]/route.ts`
- Create: `apps/web/src/app/api/timetable/[...path]/route.test.ts`

**Interfaces:**
- API base: `/api/v1/timetable`; school list, session timetable read, slot create/update/delete, and timetable publish routes as defined in the spec.
- Exact routes: `GET /schools`; `GET /schools/:schoolId/sessions/:sessionId?sectionId=&teacherMembershipId=`; `POST /schools/:schoolId/sessions/:sessionId/slots`; `PATCH|DELETE /schools/:schoolId/slots/:slotId`; `POST /schools/:schoolId/sessions/:sessionId/publish`.
- Every API handler derives tenant/account/membership from the authenticated request, checks `timetable.read` or `timetable.manage`, and calls `withTenantContext`.
- Proxy exposes only the documented methods/path shapes, forwards the existing session/CSRF headers, bounds mutation bodies to 16 KiB, and returns 503 on upstream unavailability.

- [ ] **Step 1: Write failing API and proxy tests.** Cover auth, missing CSRF, school permissions, invalid references, CRUD, conflict status/messages, failed publish remaining draft, publish visibility, teacher filtering, and proxy route allowlisting/body limits.
- [ ] **Step 2: Run focused tests and confirm failure.** Run `pnpm --filter @classloom/api test:e2e -- src/timetable/timetable.e2e-spec.ts` and the web proxy test file.
- [ ] **Step 3: Implement controller, module, and proxy.** Use strict Zod bodies and established error mapping; do not leak raw SQL errors.
- [ ] **Step 4: Run API/proxy tests and commit.** Commit `feat(api): expose school timetable endpoints`.

### Task 5: Responsive timetable UI and Admissions search polish

**Files:**
- Create: `apps/web/src/lib/timetable-api.ts`
- Create: `apps/web/src/app/timetable/page.tsx`
- Create: `apps/web/src/app/timetable/timetable-client.tsx`
- Create: `apps/web/src/app/timetable/timetable-client.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/admissions/admissions-client.tsx`

**Interfaces:**
- Client API exposes list schools, read one school/session timetable with section/teacher filters, create/update/delete a slot, and publish.
- `/timetable` resolves the server session and composes the existing `AppShell`; client capabilities determine visible actions but never replace API checks.
- Desktop renders day columns with time-sorted slots; narrow view uses weekday tabs and a time-sorted list.

- [ ] **Step 1: Write failing web tests.** Cover loading/empty/error states, school/session/section/teacher filters, manager vs reader actions, conflict messaging, publish/edit state, and narrow weekday tabs.
- [ ] **Step 2: Run `pnpm --filter @classloom/web test -- src/app/timetable/timetable-client.test.tsx` and confirm failure.**
- [ ] **Step 3: Implement client API and responsive screens.** Reuse installed Base UI Card, Badge, Button, Select, Input, Tabs, Dialog, Alert, Skeleton, and Empty primitives; preserve keyboard operation, labels, focus, and semantic design tokens.
- [ ] **Step 4: Show the approved warning when a manager edits a published timetable, explaining that readers will see it again after republishing.** Keep the warning inside the edit flow and preserve the `draft` state until explicit publish.
- [ ] **Step 5: Fix the Admissions desktop filter grid.** Allocate the search field two columns at `xl` while preserving its mobile single-column placement; verify the placeholder remains visible at desktop width.
- [ ] **Step 6: Run focused web tests, lint, and typecheck; commit.** Commit `feat(web): add responsive timetable workspace`.

### Task 6: Deterministic Faker timetable seed

**Files:**
- Create: `packages/db/src/seed-phase8-demo.ts`
- Create: `packages/db/src/seed-phase8-demo.spec.ts`
- Modify: `packages/db/package.json`
- Modify: root `package.json`

**Interfaces:**
- `parsePhase8SeedArgs(args, nodeEnv)` requires `--tenant`, `--school`, `--session` (ID or code), and optional non-negative `--seed` (default `26092026`); it rejects `NODE_ENV=production`.
- `buildPhase8DemoFixtures(seed, options)` produces deterministic reserved `DEMO-TT-*` subjects and slots from selected demo sections; teacher assignment is nullable.
- Command: `pnpm db:seed-phase8-demo -- --tenant <slug-or-id> --school <code-or-id> --session <id-or-code> [--seed 26092026]`.

- [ ] **Step 1: Write failing parser and fixture tests.** Assert explicit targets, production refusal, deterministic output, reserved codes, valid non-overlapping times, and nullable teacher assignments.
- [ ] **Step 2: Run the focused test and confirm failure.** Run `pnpm --filter @classloom/db test -- seed-phase8-demo.spec.ts`.
- [ ] **Step 3: Implement the trusted seeder.** Resolve an active audit actor and explicit tenant/school/session using the provisioner connection; create missing reserved `DEMO-TT-*` subjects through Academic helpers; generate bounded non-overlapping weekdays, times, and room labels; use an eligible existing assignment for matching subjects when available or persist a null teacher assignment; add slots with `withTenantContext`; reuse only reserved demo keys; preserve manual conflicts; create no identities, staff profiles, credentials, or invitations.
- [ ] **Step 4: Add persistence tests and run the seed twice locally.** Verify first run creates synthetic records, second run reports them existing, manual slots remain unchanged, and identity/credential/invitation counts do not change. Target the local `ClassLoom Demo School` development tenant only.
- [ ] **Step 5: Add and verify root/package scripts; commit.** Commit `dev: seed phase 8 timetable demo data`.

### Task 7: Documentation and complete verification

**Files:**
- Create: `docs/product/phase-8-timetable.md`
- Modify: `docs/architecture/module-boundaries.md`
- Modify: `docs/product/mvp-scope.md`
- Modify: `docs/development/local-setup.md`
- Modify: `README.md`
- Modify: `docs/decisions/ADR-0007-phase-8-timetable.md` if implementation details require a precise correction

- [ ] **Step 1: Document the Phase 8 workflow.** Explain schedule permissions, weekly slot rules, publication, conflict responses, local migration, and explicit Faker seed command/prerequisites.
- [ ] **Step 2: Run database migration and checks locally.** Use `.env` development connections only; verify migration repeatability and runtime-role RLS grants.
- [ ] **Step 3: Run focused and workspace verification.** Run `pnpm --filter @classloom/db test`, `pnpm --filter @classloom/api test`, relevant API end-to-end tests with dotenv, `pnpm --filter @classloom/web test`, then `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- [ ] **Step 4: Smoke-test and visually inspect.** Use deterministic demo timetable data; verify desktop and 390px layouts, draft/published views, conflicts, filters, and Admissions search placeholder.
- [ ] **Step 5: Confirm status and commit documentation.** Ensure no generated local secrets or unrelated files are staged; commit `docs: document phase 8 timetable`.
