# Phase 7 Admissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a school-scoped staff workflow from enquiry through review and an explicit, atomic accepted-application conversion into a student and initial enrollment.

**Architecture:** The Admissions API module owns case data and lifecycle rules. It calls narrow People and Enrollment contracts for cross-domain identity and enrollment effects in the same tenant transaction. PostgreSQL forced RLS and school-scoped permissions remain authoritative; the web app is a same-origin client of the API.

**Tech Stack:** TypeScript, NestJS, Drizzle ORM, PostgreSQL, Zod, Next.js App Router, Vitest, shadcn Base UI.

**Spec:** `docs/superpowers/specs/2026-09-27-phase-7-admissions-design.md`

## Global Constraints

- Keep the API a modular monolith; domain modules interact through explicit application contracts, not another module's tables.
- Tenant context comes from the authenticated server-side membership, never an untrusted client tenant ID.
- Every tenant-owned database operation uses `withTenantContext` and forced row-level security.
- Mutating browser requests preserve exact-origin checks and `X-ClassLoom-Request: 1`.
- Use Node.js 24.15+ and pnpm 11.19; use the repository's existing Vitest, ESLint/Oxlint, and shadcn Base UI conventions.
- Do not add public family applications, document uploads, automatic email, waitlists, payments, or automatic conversion.
- Keep applicant PII out of audit metadata; do not hard-delete cases or event history.
- Add a new Drizzle migration; never edit an already-applied migration.

## Review Focus

- Cross-tenant or cross-school case IDs, student links, and placement IDs must fail without disclosing foreign record existence; cover in database/API isolation tests.
- Two simultaneous decisions or conversion attempts must not produce conflicting statuses or duplicate student/enrollment records; cover with PostgreSQL concurrency tests.
- A failure after People creation but before enrollment completion must roll back all conversion effects, including case status/events; cover with an atomicity integration test.
- An Admission Officer must be able to convert without receiving broad direct student/enrollment creation rights; cover role-template and endpoint authorization tests.
- Long search text, invalid filters, and empty/partial application data must return bounded results or field-specific errors without breaking the worklist; cover API and web tests.

---

### Task 1: Admissions permissions and tenant-owned schema

**Files:**
- Modify: `packages/db/src/authorization-catalog.ts`
- Modify: `packages/db/src/authorization-catalog.spec.ts`
- Modify: `packages/db/src/authorization-seeding.ts`
- Modify: `packages/db/src/authorization-seeding.spec.ts`
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/src/admissions-schema.spec.ts`
- Create: `packages/db/drizzle/0012_phase7_admissions.sql` (generated; review generated SQL and snapshot)

**Interfaces:**
- Produces permission keys `admissions.read`, `admissions.manage`, and `admissions.convert`, each school-scoped; built-in `admission_officer` role grants all three. Tenant and school administrators receive all three; principal and auditor receive read only.
- Produces Drizzle tables `admissionCases`, `admissionCaseGuardians`, and `admissionCaseEvents`, exported through `packages/db/src/index.ts`, with tenant/school scoped keys, RLS, status checks, case-reference uniqueness, bounded guardian ordinals, and immutable event rows at the application API.

- [ ] **Step 1: Write failing permission/catalog tests** asserting exact permission metadata and grants for the tenant administrator, school administrator, principal, auditor, and `admission_officer`, with no broad `student.manage`/`enrollment.manage` grants to the Admission Officer role.
- [ ] **Step 2: Run** `pnpm --filter @classloom/db exec vitest run src/authorization-catalog.spec.ts` and confirm the new expectations fail.
- [ ] **Step 3: Add permission metadata and `admission_officer` template** in `authorization-catalog.ts`; update seed logic and tests so repeated tenant seeding creates the role and grants once.
- [ ] **Step 4: Write failing schema tests** for case status values, tenant/school references, unique school case reference, actor references, event history keys, and tenant RLS requirements.
- [ ] **Step 5: Define schema and export types** in `schema.ts`/`index.ts`; run `pnpm db:generate`; review generated SQL for table constraints, forced RLS, tenant isolation policy, indexes, grants, and permission/role seeds for existing tenants; retain migration number `0012` if it is next in the journal.
- [ ] **Step 6: Run** `pnpm --filter @classloom/db exec vitest run src/authorization-catalog.spec.ts src/authorization-seeding.spec.ts src/admissions-schema.spec.ts` and confirm the schema/catalog checks pass.
- [ ] **Step 7: Commit** as `feat: add admissions permissions and schema`.

### Task 2: Admissions persistence and lifecycle rules

**Files:**
- Create: `packages/db/src/admissions.ts`
- Create: `packages/db/src/admissions.spec.ts`
- Create: `packages/db/src/admissions.integration.spec.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- `AdmissionScope = { tenantId: string; schoolId: string }`.
- `AdmissionActor = { accountId: string; membershipId: string; requestId?: string }`; `AdmissionTransitionAction = 'submit' | 'start_review' | 'return_to_draft' | 'accept' | 'reject' | 'withdraw'`.
- `createAdmissionCase(tx, scope, input, actor)` creates `enquiry` or `draft`, up to 10 guardian application rows, and its initial event.
- `getAdmissionCase(tx, scope, caseId)` returns one case with its guardian application rows; `listAdmissionCases(tx, scope, filters)` returns paged worklist rows; filters support bounded `q`, status, `requestedSessionId`, `createdFrom`, `createdTo`, cursor, and limit.
- `updateAdmissionCase(tx, scope, caseId, input, actor)` edits applicant/application and guardian fields only in `enquiry` or `draft`.
- `transitionAdmissionCase(tx, scope, caseId, action: AdmissionTransitionAction, actor, note?)` locks the case row, enforces the spec transition table, and atomically appends event and security audit metadata.
- `recordAdmissionConversion(tx, scope, caseId, conversionRefs, actor)` locks and accepts only `accepted`, writes all conversion references, sets `admitted`, and appends event/audit atomically.

- [ ] **Step 1: Write failing unit tests** for create defaults, editable states, every allowed/denied transition, required decision/withdrawal reasons, bounded filters, event append, and PII-free audit metadata.
- [ ] **Step 2: Run** `pnpm --filter @classloom/db exec vitest run src/admissions.spec.ts` and confirm expected failures.
- [ ] **Step 3: Implement normalization and persistence functions** in `admissions.ts`; use `FOR UPDATE` on transition/conversion and translate uniqueness/stale-state conflicts to a typed `AdmissionError`.
- [ ] **Step 4: Run unit tests** and confirm the state-machine and normalization cases pass.
- [ ] **Step 5: Add PostgreSQL integration tests** for forced RLS, missing tenant context, cross-school/tenant rejection, unique references, concurrent transitions, event atomicity, and rollback of conversion references.
- [ ] **Step 6: Run** `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db exec vitest run src/admissions.integration.spec.ts` and confirm the integration suite passes with the restricted runtime role.
- [ ] **Step 7: Commit** as `feat: add admissions case persistence`.

### Task 3: Admissions API, authorization, and atomic conversion

**Files:**
- Create: `apps/api/src/admissions/admissions.module.ts`
- Create: `apps/api/src/admissions/admissions.controller.ts`
- Create: `apps/api/src/admissions/admissions.service.ts`
- Create: `apps/api/src/admissions/admissions.service.spec.ts`
- Create: `apps/api/src/admissions/admissions.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/enrollment/enrollment.service.ts`
- Modify: `apps/api/src/enrollment/enrollment.service.spec.ts`
- Modify: `apps/api/src/enrollment/enrollment.module.ts`

**Interfaces:**
- `AdmissionsModule` imports Auth, Authorization, People, Academics, and Enrollment modules and owns `GET /api/v1/admissions/schools` plus all `/api/v1/admissions/schools/:schoolId/cases` routes from the spec. The school picker returns only school IDs/names and admissions capability flags for the active membership.
- `AdmissionsService` enforces school-scoped `admissions.read`, `admissions.manage`, or `admissions.convert`; controller validates strict Zod bodies, derives actor/tenant from the session, and wraps each operation in `withTenantContext`.
- Add an exported `EnrollmentService.admitStudentFromAdmissions(tx, actor, schoolId, input)` contract which requires `admissions.convert` and performs People/Academics/Enrollment validation and creation without requiring broad `student.manage` or `enrollment.manage` grants. Preserve current `admitStudent` authorization and behavior for existing direct-admission routes.
- Conversion sequence in one tenant transaction: lock accepted case; explicitly resolve/create People profiles and relationships; invoke the Enrollment contract; store student/school/academic enrollment references; set `admitted`; append case event and audit. Any failure rolls back the entire transaction.

- [ ] **Step 1: Write failing service tests** for school permission checks, valid and invalid transitions, bounded decision notes, explicit existing-student link behavior, conversion input validation, and duplicate/stale conversion handling.
- [ ] **Step 2: Run** `pnpm --filter @classloom/api exec vitest run src/admissions/admissions.service.spec.ts` and confirm expected failures.
- [ ] **Step 3: Implement AdmissionsService and Enrollment contract**; maintain existing direct admission behavior and require `admissions.convert` for the dedicated contract.
- [ ] **Step 4: Add the controller/module and register AdmissionsModule**; implement bounded cursor/search/status/session/date filters and each lifecycle endpoint from the spec; map domain errors to the existing validation/conflict/not-found envelope.
- [ ] **Step 5: Run** `pnpm --filter @classloom/api exec vitest run src/admissions/admissions.service.spec.ts src/enrollment/enrollment.service.spec.ts` and confirm service/direct-admission tests pass.
- [ ] **Step 6: Add E2E tests** for no session, wrong school/tenant, read-only role, Admission Officer lifecycle and conversion access, no broad permissions, all transitions, complete successful conversion, failure rollback, retry/concurrent conversion, and field-specific errors.
- [ ] **Step 7: Run** `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test:e2e -- admissions.e2e-spec.ts` and confirm the E2E suite passes.
- [ ] **Step 8: Commit** as `feat: add admissions API workflow`.

### Task 4: Same-origin web API and Admissions screens

**Files:**
- Create: `apps/web/src/app/api/admissions/[...path]/route.ts`
- Create: `apps/web/src/app/api/admissions/[...path]/route.test.ts`
- Create: `apps/web/src/lib/admissions-api.ts`
- Create: `apps/web/src/lib/admissions-api.test.ts`
- Create: `apps/web/src/app/admissions/page.tsx`
- Create: `apps/web/src/app/admissions/admissions-client.tsx`
- Create: `apps/web/src/app/admissions/admissions-client.test.tsx`
- Create: `apps/web/src/app/admissions/new/page.tsx`
- Create: `apps/web/src/app/admissions/new/admission-form.tsx`
- Create: `apps/web/src/app/admissions/new/admission-form.test.tsx`
- Create: `apps/web/src/app/admissions/[caseId]/page.tsx`
- Create: `apps/web/src/app/admissions/[caseId]/admission-case-client.tsx`
- Create: `apps/web/src/app/admissions/[caseId]/admission-case-client.test.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/lib/navigation.ts` and `apps/web/src/lib/navigation.test.ts` if the existing helper is used for active nav state.

**Interfaces:**
- `apps/web/src/lib/admissions-api.ts` exports typed school/worklist/case/event/result inputs and `listAdmissionSchools`, `listAdmissionCases`, `createAdmissionCase`, `getAdmissionCase`, `updateAdmissionCase`, `submitAdmissionCase`, `reviewAdmissionCase`, `decideAdmissionCase`, `withdrawAdmissionCase`, `admitAdmissionCase`, and `listAdmissionCaseEvents`.
- Same-origin proxy allowlists only the admissions routes and methods in the spec; it forwards cookies, origin/referer, CSRF marker, content type, and query string, with bounded JSON request bodies.
- Protected server pages follow existing cookie/session redirects. Client components own search, filter, forms, transitions, event timeline, and conversion dialog.

- [ ] **Step 1: Write failing proxy and API-helper tests** for allowlisted routes, rejected arbitrary paths, query encoding, credentials/CSRF headers, and useful API error details.
- [ ] **Step 2: Run** `pnpm --filter @classloom/web exec vitest run src/app/api/admissions/'[...path]'/route.test.ts src/lib/admissions-api.test.ts` and confirm the new behavior fails.
- [ ] **Step 3: Implement proxy and typed API helpers** using established same-origin patterns; run the tests and confirm they pass.
- [ ] **Step 4: Write failing UI tests** for worklist filters, no-access/empty/loading/errors, create enquiry/draft, case event history, transition controls, conversion confirmation, field validation, and stale/conflict responses.
- [ ] **Step 5: Implement `/admissions`, `/admissions/new`, and `/admissions/[caseId]`** using installed shadcn Base UI components, existing semantic tokens, and `DESIGN.md`; add an active Admissions navigation item in the school-management section.
- [ ] **Step 6: Run** `pnpm --filter @classloom/web exec vitest run src/app/admissions src/lib/admissions-api.test.ts src/app/api/admissions/'[...path]'/route.test.ts` and confirm web tests pass.
- [ ] **Step 7: Run** `pnpm --filter @classloom/web lint` and `pnpm --filter @classloom/web typecheck`; resolve diagnostics before committing.
- [ ] **Step 8: Commit** as `feat: add admissions staff interface`.

### Task 5: Product documentation and whole-phase verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/module-boundaries.md`
- Modify: `docs/architecture/identity-and-access.md`
- Modify: `docs/architecture/multi-tenancy.md`
- Create: `docs/decisions/ADR-0006-phase-7-admissions.md`
- Create or modify: `docs/product/phase-7-admissions.md`

- [ ] **Step 1: Document** Admissions ownership, explicit People/Enrollment contracts, permission grants and Admission Officer, workflow/status transitions, conversion behavior, and local use; record any durable domain decision in the ADR.
- [ ] **Step 2: Run** `pnpm db:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm --filter @classloom/api test:e2e`, and the relevant Postgres-backed DB/API checks with `.env` loaded.
- [ ] **Step 3: Inspect the migration and run it locally** using `pnpm db:migrate`; verify restricted-runtime RLS and role seeding for both existing and newly provisioned tenants.
- [ ] **Step 4: Review the UI** at desktop and narrow viewport widths for the worklist, case creation/detail, status history, and conversion form; correct accessibility, contrast, and responsive issues.
- [ ] **Step 5: Run** `git diff --check`, inspect `git status` and the full branch diff; report commands that could not run and their exact environment blocker.
- [ ] **Step 6: Commit** as `docs: document phase 7 admissions`.
