# Phase 6 Students, Guardians, and Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver tenant-safe student and guardian identities, historical school and academic enrollment, preview-first CSV import, and usable ClassLoom administration screens.

**Architecture:** People owns tenant-wide student and guardian identity through an exported transaction-aware service. A new Enrollment module depends one way on People and Academics, owns placement lifecycle and cross-domain workflows, and hosts the school-scoped student, guardian, enrollment, and import controllers. All tenant data uses PostgreSQL forced RLS and explicit school authorization.

**Tech Stack:** pnpm monorepo; PostgreSQL; Drizzle ORM; NestJS 12; Zod 4; Next.js 16 App Router; React 19; Tailwind CSS 4; shadcn `base-nova` on Base UI; Vitest; `csv-parse`; `@faker-js/faker` as a development dependency.

**Spec:** `docs/superpowers/specs/2026-09-26-phase-6-students-guardians-enrollment-design.md`

## Global Constraints

- Use Node.js 24.15+ and pnpm 11.19.
- Name the branch `phase-6-students-guardians-enrollment`; never add a `codex/` prefix.
- Preserve unrelated working-tree edits, especially existing edits to package or environment files, and stage only task-owned changes.
- Keep People, Enrollment, and Academics interactions behind explicit transaction-aware service contracts; do not query another API module's tables as an implicit interface.
- Derive tenant context from the authenticated active membership and run every tenant-owned operation through `withTenantContext` with forced RLS.
- Add a new Drizzle migration; do not rewrite an applied migration.
- Keep raw CSV and personal fields out of import-batch storage, logs, and audit metadata.
- Limit CSV files to UTF-8, comma-delimited, 2 MiB, and 1,000 data rows; commit only after full revalidation and in one transaction.
- Reuse installed shadcn components first. Add only required `@shadcn` Base UI components through the shadcn MCP/CLI workflow; do not add Radix or another UI library.
- Use semantic theme tokens, accessible labels and focus states, field-level errors, animated toasts, and readable text contrast.
- Install `@faker-js/faker` only as a development dependency and refuse demo seeding in production mode.
- Keep Admissions, portal dashboards, attendance, timetable, fees, examinations, document storage, and messaging outside Phase 6.

## Review Focus

- A malformed CSV, UTF-8 BOM, duplicate header, oversized file, or extra row must return a useful validation error and write nothing; Task 5 pins these cases.
- Repeated student or guardian codes with conflicting shared fields must be rejected without partial writes; Task 5 pins grouped-row conflicts.
- Simultaneous enrollment or transfer requests must never create two active placements; Task 3 pins database locking and uniqueness behavior.
- A school manager without access to every currently related school must not edit shared student or guardian identity or account links; Tasks 2 and 5 pin all-school checks.
- Reusing an import idempotency key with the same payload must return the prior result, while a different checksum or mapping must conflict; Task 5 pins both paths.

---

### Task 1: Permission catalog, schema, and migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/authorization-catalog.ts`
- Modify: `packages/db/src/authorization-catalog.spec.ts`
- Create: `packages/db/src/student-enrollment-schema.integration.spec.ts`
- Create: `packages/db/drizzle/0011_phase6_students_enrollment.sql`
- Create: `packages/db/drizzle/meta/0011_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: existing tenant, school, membership, academic-session, class, section, permission, role, and audit tables.
- Produces: `studentProfiles`, `guardianProfiles`, `studentGuardianRelationships`, `studentSchoolEnrollments`, `studentAcademicEnrollments`, and `studentImportBatches`; permission keys `student.read`, `student.manage`, `guardian.read`, `guardian.manage`, `enrollment.read`, and `enrollment.manage`.

- [ ] **Step 1: Write failing catalog and schema tests.** Assert exact permission scope/action/read-only values, built-in role membership, all six table exports, composite foreign keys, partial active-enrollment indexes, school admission-number uniqueness, active section roll-number uniqueness, forced RLS, and runtime-role denial without tenant context.
- [ ] **Step 2: Run red database tests.** Run `pnpm --filter @classloom/db test -- authorization-catalog.spec.ts student-enrollment-schema.integration.spec.ts`; expect missing permissions and schema exports.
- [ ] **Step 3: Add schema and permission definitions.** Use the exact statuses, immutable codes, optional same-tenant membership links, relationship flags, historical enrollment fields, idempotency metadata, and constraints from the spec. Give student and guardian membership links separate tenant-scoped unique indexes so one adult account may still link to a staff profile.
- [ ] **Step 4: Generate and inspect migration 0011.** Run `pnpm db:generate -- --name phase6_students_enrollment`; inspect `0011_phase6_students_enrollment.sql`, then add forced RLS policies, runtime grants, catalog seeding, and built-in-role backfill consistent with migration 0010.
- [ ] **Step 5: Run green schema tests and migration check.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test -- authorization-catalog.spec.ts student-enrollment-schema.integration.spec.ts`, `pnpm db:migrate`, and `pnpm db:check`; expect all to pass.
- [ ] **Step 6: Commit.** Stage only schema, migration, metadata, catalog, and their tests; commit `feat(db): add student guardian and enrollment schema`.

### Task 2: People persistence and transaction-aware student contract

**Files:**
- Create: `packages/db/src/students.ts`
- Create: `packages/db/src/students.spec.ts`
- Create: `packages/db/src/students.integration.spec.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/api/src/people/student-people.service.ts`
- Create: `apps/api/src/people/student-people.service.spec.ts`
- Modify: `apps/api/src/people/people.module.ts`

**Interfaces:**
- Consumes: Task 1 tables and permission keys plus `TenantTransaction`.
- Produces: `StudentScope`, `StudentProfileInput`, `GuardianProfileInput`, `GuardianRelationshipInput`, `StudentPeopleActor`; normalization and CRUD functions; `StudentPeopleService.requireStudentRead`, `requireStudentManage`, `requireGuardianRead`, `requireGuardianManage`, `requireSharedStudentManage`, `requireSharedGuardianManage`, `createOrResolveStudent`, `createOrResolveGuardian`, and `createOrResolveRelationship`.

- [ ] **Step 1: Write failing unit tests.** Pin case-normalized codes, trimmed names/contact data, date validation, relationship-type and flag normalization, same-type membership uniqueness, inactive-membership rejection, and useful `StudentPeopleError` codes/messages.
- [ ] **Step 2: Run red unit tests.** Run `pnpm --filter @classloom/db test -- students.spec.ts` and `pnpm --filter @classloom/api test -- student-people.service.spec.ts`; expect missing modules.
- [ ] **Step 3: Implement focused People functions.** Add cursor-based profile reads by explicit IDs, create/update/inactivate operations, guardian relationships, account eligibility/link/unlink, and audit writes without personal fields. Accept active school IDs from the calling Enrollment workflow for shared authorization; People must not depend back on Enrollment.
- [ ] **Step 4: Write and run failing PostgreSQL tests.** Cover tenant isolation, absent context, code uniqueness, mismatched relationship references, guardian reuse across siblings, independent staff/guardian account linking, and pooled-connection isolation.
- [ ] **Step 5: Implement `StudentPeopleService`.** Keep staff permission methods unchanged; export the new service from `PeopleModule`. All-school shared edits must accept the Enrollment-owned active school IDs, call AuthorizationService for each, and fail with a clear forbidden message if any school is unmanaged. Reject account relinking when existing portal or audit history would become ambiguous.
- [ ] **Step 6: Run green People tests.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test -- students.spec.ts students.integration.spec.ts` and `pnpm --filter @classloom/api test -- student-people.service.spec.ts`; expect all to pass.
- [ ] **Step 7: Commit.** Commit `feat(people): add student and guardian identity services`.

### Task 3: Enrollment persistence, academic contract, and concurrency

**Files:**
- Create: `packages/db/src/enrollment.ts`
- Create: `packages/db/src/enrollment.spec.ts`
- Create: `packages/db/src/enrollment.integration.spec.ts`
- Modify: `packages/db/src/academics.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/api/src/academics/academics.service.ts`
- Create: `apps/api/src/academics/academics.service.spec.ts`
- Modify: `apps/api/src/academics/academics.module.ts`
- Create: `apps/api/src/enrollment/enrollment.service.ts`
- Create: `apps/api/src/enrollment/enrollment.service.spec.ts`
- Create: `apps/api/src/enrollment/enrollment.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: Task 1 enrollment tables; Task 2 `StudentPeopleService`; existing academic tables.
- Produces: `resolveEnrollmentPlacement(tx, scope, { sessionId, classId, sectionId })`; `createSchoolEnrollment`, `createAcademicEnrollment`, `transferAcademicEnrollment`, `withdrawAcademicEnrollment`, `completeAcademicEnrollment`, and history queries; exported `AcademicsService.requireEnrollmentPlacement`; exported `EnrollmentService` workflow methods.

- [ ] **Step 1: Write failing lifecycle tests.** Pin allowed statuses and transitions, archived-session rejection, destination hierarchy validation, start/end ordering, admission and roll-number conflicts, and readable domain errors.
- [ ] **Step 2: Run red unit tests.** Run `pnpm --filter @classloom/db test -- enrollment.spec.ts` and `pnpm --filter @classloom/api test -- academics.service.spec.ts enrollment.service.spec.ts`; expect missing functions.
- [ ] **Step 3: Implement the academic placement contract.** `AcademicsService.requireEnrollmentPlacement(tx, scope, input)` must resolve a matching non-archived session/class/section tuple and return their normalized IDs and labels.
- [ ] **Step 4: Implement enrollment commands.** Lock the current school/academic enrollment row before transitions; close and create transfer records in one transaction; never mutate historical placement identity.
- [ ] **Step 5: Write failing integration and concurrency tests.** Use two independent restricted-runtime transactions to attempt duplicate initial placement and simultaneous transfers; assert exactly one active placement and one successful workflow.
- [ ] **Step 6: Run green Enrollment tests.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test -- enrollment.spec.ts enrollment.integration.spec.ts` and `pnpm --filter @classloom/api test -- academics.service.spec.ts enrollment.service.spec.ts`; expect all to pass.
- [ ] **Step 7: Commit.** Commit `feat(enrollment): preserve school and academic placement history`.

### Task 4: Student, guardian, and enrollment HTTP APIs

**Files:**
- Create: `apps/api/src/enrollment/student-directory.controller.ts`
- Create: `apps/api/src/enrollment/guardian-directory.controller.ts`
- Create: `apps/api/src/enrollment/enrollment.controller.ts`
- Create: `apps/api/src/enrollment/enrollment.e2e-spec.ts`
- Modify: `apps/api/src/enrollment/enrollment.module.ts`

**Interfaces:**
- Consumes: Task 2 `StudentPeopleService`, Task 3 `EnrollmentService`, AuthGuard, CsrfGuard, AuthorizationService, and the existing error envelope.
- Produces: every non-import People and Enrollment route declared in the spec, with bounded cursor filters and field-specific Zod validation.

- [ ] **Step 1: Write failing E2E tests.** Cover authentication, CSRF, each school permission, tenant and school isolation, shared-edit all-school denial, student/guardian CRUD, sibling relationships, account links, school enrollment, initial placement, transfer, withdrawal, completion, archived-session rejection, filters, cursor pagination, and error envelopes.
- [ ] **Step 2: Run red API E2E tests.** Run `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test:e2e -- enrollment.e2e-spec.ts`; expect missing routes.
- [ ] **Step 3: Implement controllers and DTO schemas.** Keep controllers thin; derive `StudentPeopleActor` from the authenticated request; parse UUIDs and strict request bodies; map People, Academics, and Enrollment errors to 400/404/409 without leaking database details.
- [ ] **Step 4: Add school directory composition.** The Enrollment module may host `/people/...` controllers so it can depend one way on People and Academics. Student search obtains matching People IDs through `StudentPeopleService`, applies enrollment/session/class/section visibility, then hydrates profiles through the explicit service contract.
- [ ] **Step 5: Run green API tests.** Run API unit tests plus the focused E2E file; expect all to pass.
- [ ] **Step 6: Commit.** Commit `feat(api): expose student guardian and enrollment workflows`.

### Task 5: CSV parser, preview, atomic commit, and import API

**Files:**
- Modify: `apps/api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/api/src/enrollment/student-import.ts`
- Create: `apps/api/src/enrollment/student-import.spec.ts`
- Create: `apps/api/src/enrollment/student-import.service.ts`
- Create: `apps/api/src/enrollment/student-import.service.spec.ts`
- Create: `apps/api/src/enrollment/student-import.controller.ts`
- Create: `apps/api/src/enrollment/student-import.e2e-spec.ts`
- Modify: `apps/api/src/enrollment/enrollment.module.ts`
- Create: `packages/db/src/student-import.ts`
- Create: `packages/db/src/student-import.integration.spec.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: Tasks 2–4 People, Academics, Enrollment, authorization, and audit contracts.
- Produces: `inspectStudentCsv`, `previewStudentCsv`, `StudentImportService.commit`, import-batch idempotency helpers, and the three multipart import endpoints.

- [ ] **Step 1: Add parser dependencies without discarding existing package edits.** Add `csv-parse` to `@classloom/api` dependencies and `@types/multer` to API development dependencies through pnpm; inspect the resulting package and lockfile diff.
- [ ] **Step 2: Write failing parser tests.** Pin UTF-8 BOM handling, quoted commas/newlines, duplicate/blank headers, invalid encoding, empty files, 1,001 rows, conflicting repeated student or guardian fields, optional guardian groups, unknown/unmapped columns, and exact row/field error locations.
- [ ] **Step 3: Run red parser tests.** Run `pnpm --filter @classloom/api test -- student-import.spec.ts`; expect missing parser.
- [ ] **Step 4: Implement inspect and preview.** Use `csv-parse` with explicit comma delimiter, strict column counts, a 2 MiB controller limit, and a 1,000-row parser limit. Normalize into grouped student commands without logging cell values.
- [ ] **Step 5: Write failing service, PostgreSQL, and E2E tests.** Pin no writes during inspect/preview, all-or-nothing commit, permission conjunction, existing compatible-code reuse, conflicting-code rejection, audit counts without PII, same-key same-payload retry, and same-key different-payload conflict.
- [ ] **Step 6: Implement atomic commit and endpoints.** Recompute SHA-256 over file bytes plus canonical mapping, revalidate inside the tenant transaction, serialize idempotency on `student_import_batches`, and call transaction-aware People, Academics, and Enrollment contracts.
- [ ] **Step 7: Run green import tests.** Run focused API unit/E2E and database integration files with `.env`; expect all to pass.
- [ ] **Step 8: Commit.** Commit `feat(import): add atomic student and guardian CSV import`.

### Task 6: Deterministic Faker development seeder

**Files:**
- Modify: `packages/db/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/db/src/seed-phase6-demo.ts`
- Create: `packages/db/src/seed-phase6-demo.spec.ts`
- Modify: `.env.example` only if the existing environment contract needs a documented non-secret seed option.

**Interfaces:**
- Consumes: Phase 6 database commands, `DATABASE_PROVISIONER_URL`, explicit `--tenant`, `--school`, and optional `--seed` arguments.
- Produces: `pnpm db:seed-phase6-demo -- --tenant <slug-or-id> --school <code-or-id> [--seed 26092026]` and exported deterministic fixture builders for tests.

- [ ] **Step 1: Add Faker as a DB development dependency.** Run `pnpm --filter @classloom/db add -D @faker-js/faker`; inspect package and lockfile changes and preserve unrelated edits.
- [ ] **Step 2: Write failing seeder tests.** Assert production refusal, required explicit target, fixed-seed determinism, reserved `DEMO-` codes, sibling guardians, mixed enrollment states, no credentials/invitations, rerun idempotency, and non-demo-record preservation.
- [ ] **Step 3: Run red tests.** Run `pnpm --filter @classloom/db test -- seed-phase6-demo.spec.ts`; expect missing seeder.
- [ ] **Step 4: Implement trusted seeding command.** Use Faker only for synthetic values, resolve the explicit target through the provisioner connection, and create a bounded dataset through Phase 6 domain commands.
- [ ] **Step 5: Run green tests and a local smoke seed.** Run the focused unit test, then seed the local demo tenant twice and confirm the second run reports existing deterministic records without duplicates.
- [ ] **Step 6: Commit.** Commit `dev: add deterministic phase 6 demo data`.

### Task 7: Web API clients, same-origin proxy, and shadcn primitives

**Files:**
- Create: `apps/web/src/app/api/enrollment/[...path]/route.ts`
- Extend: `apps/web/src/app/api/people/[...path]/route.ts`
- Create: `apps/web/src/lib/students-api.ts`
- Create: `apps/web/src/lib/students-api.test.ts`
- Create: `apps/web/src/lib/enrollment-api.ts`
- Create: `apps/web/src/lib/enrollment-api.test.ts`
- Create: `apps/web/src/lib/student-import-api.ts`
- Create: `apps/web/src/lib/student-import-api.test.ts`
- Add through shadcn: `apps/web/src/components/ui/tabs.tsx`
- Add through shadcn: `apps/web/src/components/ui/checkbox.tsx`
- Add through shadcn: `apps/web/src/components/ui/progress.tsx`
- Add through shadcn: `apps/web/src/components/ui/pagination.tsx`
- Add through shadcn: `apps/web/src/components/ui/empty.tsx`
- Add through shadcn: `apps/web/src/components/ui/textarea.tsx`
- Modify only if generated dependencies require it: `apps/web/package.json`, `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 4 and 5 HTTP contracts, existing `responseError`, session cookie forwarding, and CSRF conventions.
- Produces: typed browser clients for all Phase 6 routes and reviewed Base UI primitives.

- [ ] **Step 1: Read local Next.js 16 route-handler documentation and the available React best-practices skill.** Follow `apps/web/AGENTS.md`; install the prescribed Vercel skill only if still unavailable.
- [ ] **Step 2: Reinspect installed components and registry examples with the shadcn MCP.** Fetch docs/examples for Tabs, Checkbox, Progress, Pagination, Empty, and Textarea; request project-aware add commands; preview CLI changes before installation.
- [ ] **Step 3: Add only the required `@shadcn` Base UI components.** Review generated source for Base UI `render` usage, group composition, icon library, semantic styling, and accessibility. Do not overwrite an installed component.
- [ ] **Step 4: Write failing API-helper tests.** Pin query encoding, JSON CSRF headers, multipart body forwarding without forced content type, cookie forwarding, 2 MiB rejection, allowlisted methods/routes, import idempotency header, and field-error preservation.
- [ ] **Step 5: Run red web tests.** Run `pnpm --filter @classloom/web test -- students-api.test.ts enrollment-api.test.ts student-import-api.test.ts`; expect missing clients/routes.
- [ ] **Step 6: Implement clients and proxies.** Keep `API_INTERNAL_URL` server-only; use an explicit method/path allowlist and bounded array-buffer forwarding for multipart import.
- [ ] **Step 7: Run green web helper tests, lint, and typecheck.** Expect all focused checks to pass.
- [ ] **Step 8: Commit.** Commit `feat(web): add phase 6 API clients and UI primitives`.

### Task 8: Student and guardian directories, forms, and profiles

**Files:**
- Create: `apps/web/src/app/students/page.tsx`
- Create: `apps/web/src/app/students/students-client.tsx`
- Create: `apps/web/src/app/students/students-client.test.tsx`
- Create: `apps/web/src/app/students/new/page.tsx`
- Create: `apps/web/src/app/students/student-form.tsx`
- Create: `apps/web/src/app/students/[studentId]/page.tsx`
- Create: `apps/web/src/app/students/[studentId]/student-profile-client.tsx`
- Create: `apps/web/src/app/guardians/page.tsx`
- Create: `apps/web/src/app/guardians/guardians-client.tsx`
- Create: `apps/web/src/app/guardians/[guardianId]/page.tsx`
- Create: `apps/web/src/app/guardians/[guardianId]/guardian-profile-client.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`

**Interfaces:**
- Consumes: Task 7 clients and shadcn primitives plus the existing protected-page/session and date-field patterns.
- Produces: `/students`, `/students/new`, `/students/[studentId]`, `/guardians`, and `/guardians/[guardianId]` flows.

- [ ] **Step 1: Write failing component tests.** Assert loading does not flash empty state, clearable dependent filters, school/session/class/section reset behavior, field-level server errors, successful creation navigation, profile tab accessibility, relationship flag editing, lifecycle confirmation, account-link feedback, and readable fallback names.
- [ ] **Step 2: Run red component tests.** Run the focused Phase 6 web tests; expect missing pages/components.
- [ ] **Step 3: Implement directories and navigation.** Use Table, Pagination, Badge, Avatar, Skeleton, Alert, Empty, Button, Select, and semantic tokens. Route the Students and Parents/Guardians sidebar entries to working pages.
- [ ] **Step 4: Implement creation and profile flows.** Use `FieldGroup` and `Field`, the existing date picker, Tabs, Checkbox, Dialog/AlertDialog, Spinner, inline validation, and animated Toast. Preserve selected school context and refresh from mutation responses rather than stale state.
- [ ] **Step 5: Run green web tests, lint, typecheck, and responsive browser checks.** Verify keyboard navigation, labels, focus, mobile table alternatives, light/dark contrast, and no low-contrast gray copy.
- [ ] **Step 6: Commit.** Commit `feat(web): add student guardian and enrollment administration`.

### Task 9: CSV import interface

**Files:**
- Create: `apps/web/src/app/students/import/page.tsx`
- Create: `apps/web/src/app/students/import/student-import-client.tsx`
- Create: `apps/web/src/app/students/import/student-import-client.test.tsx`
- Create: `apps/web/src/app/students/import/column-mapping.tsx`
- Create: `apps/web/src/app/students/import/import-preview.tsx`

**Interfaces:**
- Consumes: Task 7 import client and Base UI components; Task 8 school context/navigation patterns.
- Produces: Upload → Map Columns → Preview and Fix → Import Result workflow.

- [ ] **Step 1: Write failing UI tests.** Pin file-type/size rejection, header inspection, required mapping, duplicate mapping prevention, guardian conditional requirements, preview error rows, disabled commit until clean preview, idempotency reuse after retry, successful-result counts, and file reset behavior.
- [ ] **Step 2: Run red import UI tests.** Run `pnpm --filter @classloom/web test -- student-import-client.test.tsx`; expect missing UI.
- [ ] **Step 3: Implement the four-step flow.** Keep the File in memory, render Progress with an accessible label, use Select for mappings, paginate preview rows, show Alert plus row/column detail, and use Spinner/Toast without hiding actionable errors.
- [ ] **Step 4: Run green tests and browser checks.** Verify keyboard operation, screen-reader labels, narrow layout, large error sets, retry after a simulated network failure, and readable contrast.
- [ ] **Step 5: Commit.** Commit `feat(web): add student CSV import workflow`.

### Task 10: Documentation, final audit, and GitHub integration

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/module-boundaries.md`
- Modify: `docs/architecture/multi-tenancy.md`
- Modify: `docs/architecture/identity-and-access.md`
- Modify: `docs/development/testing-strategy.md`
- Modify: `docs/development/local-setup.md`
- Create: `docs/development/students-guardians-enrollment.md`
- Create: `docs/decisions/ADR-0005-tenant-wide-students-guardians-enrollment-history.md`
- Modify: this plan's checkboxes as tasks complete.

**Interfaces:**
- Consumes: all prior Phase 6 deliverables.
- Produces: operational documentation, architecture record, verified branch, published GitHub branch, and final merge to `main`.

- [ ] **Step 1: Update documentation.** Document migration, permissions, account links, lifecycle, CSV format and limits, demo seed command, local setup, module boundaries, RLS, and the tenant-wide identity decision.
- [ ] **Step 2: Run shadcn audit.** Call the shadcn MCP audit checklist, inspect every added UI file, and correct component composition, semantic styling, Base UI API, icon, focus, and accessibility issues.
- [ ] **Step 3: Run focused database verification.** Run `pnpm db:generate` only to confirm no schema drift, `pnpm db:migrate`, `pnpm db:check`, and all database tests with `.env`.
- [ ] **Step 4: Run full repository verification.** Run `pnpm lint`, `pnpm typecheck`, `pnpm exec dotenv -e .env -- pnpm test`, `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test:e2e`, and `pnpm build`; require zero failures.
- [ ] **Step 5: Run final UI smoke checks.** Seed demo data, start the app, verify student and guardian directories, creation, profile, enrollment transfer, CSV preview/commit, mobile navigation, dark mode, and success/error messaging; capture screenshots for review.
- [ ] **Step 6: Commit final documentation and fixes.** Commit `docs: document students guardians and enrollment` followed by narrowly scoped fix commits if verification finds issues.
- [ ] **Step 7: Review the complete branch.** Use a fresh whole-branch reviewer against `main...phase-6-students-guardians-enrollment`; resolve every actionable finding and rerun affected checks.
- [ ] **Step 8: Publish and merge.** Push `phase-6-students-guardians-enrollment` to GitHub, merge it into local `main` with a merge commit after all checks pass, rerun the repository test suite on merged `main`, and push `main` to GitHub. Confirm `main` and `origin/main` resolve to the same merge commit.
