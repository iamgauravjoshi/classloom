# Phase 9: Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement secure daily section attendance with complete roster saves, teacher assignment restrictions, and immutable correction history.

**Architecture:** Add an Attendance persistence domain in `packages/db`, then coordinate it through a Nest Attendance module. Enrollment supplies the date-effective roster, Academics supplies section assignment context, and People identifies linked teacher memberships through explicit contracts. A protected Next.js page calls only same-origin Attendance proxy routes.

**Tech Stack:** PostgreSQL, Drizzle, NestJS, Zod, Next.js 16, React 19, shadcn Base UI, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-28-phase-9-attendance-design.md`

## Global Constraints

- Record one daily register per school, academic session, date, and section; do not add timetable-period attendance.
- Status values are `present`, `absent`, `late`, and `excused`.
- Staff may record current or past dates inside a session, but not future school-local dates.
- A save contains exactly one status for every student in the authoritative date-effective roster; reject the whole request for omissions, duplicates, or out-of-roster IDs.
- Use authenticated membership tenant context, `withTenantContext`, forced RLS, tenant-safe references, and API authorization on every request.
- `attendance.read` and `attendance.record` are school-scoped; campus grants must not be widened automatically.
- Linked teachers are limited to sections with active assignments; resolve this through People and Academics contracts, never direct cross-domain table access.
- Attendance mutations and immutable status-change history commit or roll back together.
- Use installed shadcn Base UI components and project tokens; do not add Radix or unrelated component libraries.
- Keep the web UI responsive, keyboard-accessible, and explicit about loading, empty, incomplete, complete, and error states.
- Do not add family portals, period attendance, notifications, analytics, exports, excuse-document workflows, or attendance import.

## Review Focus

- School timezone at midnight and daylight-saving changes: the API must compare the requested school-local date with the school's local current date without browser-timezone drift.
- Enrollment changes between roster read and save: a stale roster must reject atomically and return a refreshable conflict.
- A linked teacher with no active section assignment: the API must expose no sections and must not fall back to school-wide access.
- Duplicate, omitted, foreign-school, or foreign-tenant enrollment IDs: the API must reject the complete save without partial writes or cross-scope disclosure.
- Concurrent saves and corrections to the same register: serialization must preserve a consistent final status and complete audit history.

---

### Task 1: Attendance schema and tenant-safe persistence

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/attendance.ts`
- Create: `packages/db/src/attendance.spec.ts`
- Create: `packages/db/src/attendance.integration.spec.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/authorization-catalog.ts`
- Modify: `packages/db/src/authorization-catalog.spec.ts`
- Generate: `packages/db/drizzle/0015_*.sql` and matching Drizzle snapshot

**Interfaces:**
- Export `AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'`.
- Export `AttendanceScope = { tenantId: string; schoolId: string }` and an actor carrying account ID, membership ID, and request ID.
- Export `readDailyAttendance(tx, scope, { sessionId, sectionId, date }, roster)`; return a register (or `null`), status entries merged with the supplied authoritative roster, and completion counts.
- Export `saveDailyAttendance(tx, scope, { sessionId, sectionId, date, entries }, roster, actor)`; validate exact roster coverage, lock/create the register, upsert every status, append before/after events only for changed statuses, and return the saved register.
- Export `listDailyAttendanceEvents(tx, scope, registerId)` with stable chronological ordering.
- Update the two attendance permission catalog entries to `scopeKind: 'school'`; preserve their keys and role templates.

- [ ] **Step 1: Write failing persistence and catalog tests**
  - In `attendance.spec.ts`, cover exact status parsing, completion counts, omitted/duplicate/out-of-roster entries, and event creation only when a status changes.
  - In `attendance.integration.spec.ts`, cover tenant isolation, school/session/section/enrollment composite references, absent tenant context, atomic rollback, correction events, and two concurrent saves on one register.
  - Update `authorization-catalog.spec.ts` to assert both attendance permissions are school-scoped.
- [ ] **Step 2: Run focused tests and verify the expected failures**
  - Run: `pnpm --filter @classloom/db test -- src/attendance.spec.ts src/attendance.integration.spec.ts src/authorization-catalog.spec.ts`
  - Expected: new attendance exports/tables are missing and the old permission scope assertion fails.
- [ ] **Step 3: Add Drizzle tables and constraints**
  - Add a unique register on `(tenantId, schoolId, sessionId, sectionId, attendanceDate)`.
  - Add status rows scoped to the register and academic enrollment, checked against the four status values.
  - Add immutable event rows with actor account/membership, request ID, enrollment ID, previous/new status, and timestamp.
  - Add composite foreign keys to school, session, section, academic enrollment, and actor membership; add lookup/history indexes and tenant isolation policies.
- [ ] **Step 4: Implement and export persistence operations**
  - Implement exact-roster comparison, transaction-scoped register locking, batch upsert, event insertion, completion calculation, and chronological history reads in `attendance.ts`.
  - Export the schema and public functions/types from `index.ts`.
  - Update `authorization-catalog.ts` so both attendance permissions use school scope.
- [ ] **Step 5: Generate and inspect the migration**
  - Run: `pnpm db:generate`
  - Inspect the generated SQL and snapshot. Ensure the migration has forced RLS, tenant policies, least-privilege runtime grants, composite foreign keys, checks/indexes, and an update to the existing permission catalog rows. Do not edit an applied migration.
- [ ] **Step 6: Run focused DB tests and checks**
  - Run: `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test -- src/attendance.spec.ts src/attendance.integration.spec.ts src/authorization-catalog.spec.ts`
  - Run: `pnpm --filter @classloom/db typecheck`
  - Expected: focused tests and typecheck pass against the local PostgreSQL runtime role.
- [ ] **Step 7: Commit the DB slice**
  - Commit schema, migration, persistence, exports, and tests with `feat: add attendance persistence`.

### Task 2: Enrollment, Academics, and People contracts

**Files:**
- Modify: `packages/db/src/enrollment.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `apps/api/src/enrollment/enrollment.service.ts`
- Modify: `apps/api/src/enrollment/enrollment.module.ts`
- Modify: `apps/api/src/academics/academics.service.ts`
- Modify: `apps/api/src/people/people.service.ts`
- Modify: `apps/api/src/people/people.module.ts`
- Test: `packages/db/src/enrollment.spec.ts`, `packages/db/src/enrollment.integration.spec.ts`
- Test: `apps/api/src/enrollment/enrollment.service.spec.ts`, `apps/api/src/academics/academics.service.spec.ts`, and `apps/api/src/people/people.service.spec.ts`

**Interfaces:**
- Add `listAttendanceRoster(tx, scope, sessionId, sectionId, date)` to Enrollment; return only students whose academic enrollment is effective on the requested date, with IDs and display/roll data required for attendance.
- Add `listAttendanceSections(tx, scope, sessionId, membershipId?)` to Academics; validate the session and return section labels plus sections assigned to the supplied membership when requested.
- Add `getAttendanceTeacherLink(tx, scope, membershipId)` to People; distinguish an unlinked staff membership from a linked teacher profile and report current assignment eligibility without returning profile PII.
- Attendance consumes these methods inside the same `TenantTransaction`; no API controller may query another module's tables.

- [ ] **Step 1: Write failing contract tests**
  - Verify Enrollment includes start dates on/before the requested date and excludes enrollments whose end date is earlier.
  - Verify Academics rejects foreign sessions and returns only the membership's assigned sections for teacher filtering.
  - Verify People distinguishes unlinked, actively linked, and ineligible teacher memberships without returning private profile fields.
- [ ] **Step 2: Run the focused tests and confirm they fail**
  - Run the DB and API Vitest files listed above.
  - Expected: the new contract methods are not implemented.
- [ ] **Step 3: Implement the narrow domain contracts**
  - Implement date-effective roster selection in Enrollment persistence and expose it through `EnrollmentService` without applying the caller-facing `enrollment.read` permission a second time; Attendance owns its access decision.
  - Implement section assignment filtering through the existing Academic setup reader.
  - Implement People teacher-link eligibility using existing staff/profile ownership rules and return only the boolean/ID data Attendance needs.
- [ ] **Step 4: Run contract tests and typechecks**
  - Run the focused DB/API Vitest files and `pnpm --filter @classloom/db typecheck` plus `pnpm --filter @classloom/api typecheck`.
  - Expected: all contracts pass and no circular module dependency is introduced.
- [ ] **Step 5: Commit the contract slice**
  - Commit with `feat: expose attendance roster contracts`.

### Task 3: Attendance application service and API

**Files:**
- Create: `apps/api/src/attendance/attendance.module.ts`
- Create: `apps/api/src/attendance/attendance.service.ts`
- Create: `apps/api/src/attendance/attendance.service.spec.ts`
- Create: `apps/api/src/attendance/attendance.controller.ts`
- Create: `apps/api/src/attendance/attendance.controller.spec.ts`
- Create: `apps/api/src/attendance/attendance.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- `AttendanceService.listSchools(actor)` returns accessible schools with timezone plus `canReadAttendance` and `canRecordAttendance`.
- `AttendanceService.listSessions(actor, schoolId)` returns academic session choices after school-scope authorization.
- `AttendanceService.listSections(actor, schoolId, sessionId)` returns only sections visible to that member; linked teacher memberships receive assigned sections only.
- `AttendanceService.readRegister(actor, scope, sessionId, date, sectionId)` checks school permission, date/session bounds, teacher assignment eligibility, and returns roster/status/completion data.
- `AttendanceService.saveRegister(actor, scope, sessionId, date, sectionId, entries)` checks `attendance.record`, validates school-local date and current roster, then performs persistence within one `withTenantContext` transaction.
- `AttendanceService.readHistory(actor, scope, registerId)` checks `attendance.read` and returns immutable status events for that school register.
- Use strict Zod schemas for UUIDs, ISO dates, entry uniqueness, and status enums. Expose routes under `/api/v1/attendance` and preserve AuthGuard, CsrfGuard, exact-origin behavior, request IDs, and error envelopes.

- [ ] **Step 1: Write failing service and API tests**
  - Cover school permission capability flags, tenant mismatch, school-local midnight and daylight-saving boundaries, future dates, session boundaries, teacher assignment filtering, read-only access, and stale roster conflicts.
  - Cover strict rejection of duplicate entries and extra request fields, CSRF/auth behavior, and the documented GET/PUT route contract.
- [ ] **Step 2: Run focused API tests and confirm failures**
  - Run: `pnpm --filter @classloom/api test -- src/attendance/attendance.service.spec.ts src/attendance/attendance.controller.spec.ts`
  - Run: `pnpm --filter @classloom/api test:e2e -- src/attendance/attendance.e2e-spec.ts`
  - Expected: module, routes, and service are absent.
- [ ] **Step 3: Implement service authorization and date validation**
  - Use `AuthorizationService.hasPermissions` at school scope.
  - Use `Intl.DateTimeFormat` with the school's configured IANA timezone to determine today's date; reject future and out-of-session dates without converting the stored PostgreSQL date through the browser timezone.
  - For linked teacher profiles, intersect section access with active Academic assignments; return no sections if the profile is no longer eligible or has no assignment.
  - For non-teacher operators, honor only their school-level attendance grants. Do not reinterpret campus grants as school grants.
- [ ] **Step 4: Implement strict routes and error mapping**
  - Add `GET /attendance/schools`, `GET /attendance/schools/:schoolId/sessions`, `GET /attendance/schools/:schoolId/sessions/:sessionId/sections`, `GET /attendance/schools/:schoolId/sessions/:sessionId/register?date=YYYY-MM-DD&sectionId=<uuid>`, `PUT` to the same register route with `{ entries: [{ academicEnrollmentId, status }] }`, and `GET /attendance/schools/:schoolId/registers/:registerId/events` for immutable change history.
  - Map missing/out-of-scope resources to non-disclosing not-found responses, stale roster to conflict, and validation/date issues to readable bad-request responses.
  - Register `AttendanceModule` in `AppModule` and inject the Enrollment, Academics, People, Authorization, and Database services through module exports.
- [ ] **Step 5: Run API tests and checks**
  - Run focused unit and end-to-end tests with local `.env` loaded.
  - Run: `pnpm --filter @classloom/api lint` and `pnpm --filter @classloom/api typecheck`.
  - Expected: authorization, cross-school isolation, full-save rollback, and audit assertions pass.
- [ ] **Step 6: Commit the API slice**
  - Commit with `feat: add attendance API`.

### Task 4: Responsive Attendance web workflow

**Files:**
- Create: `apps/web/src/app/attendance/page.tsx`
- Create: `apps/web/src/app/attendance/attendance-client.tsx`
- Create: `apps/web/src/app/attendance/attendance-client.test.tsx`
- Create: `apps/web/src/lib/attendance-api.ts`
- Create: `apps/web/src/app/api/attendance/[...path]/route.ts`
- Create: `apps/web/src/app/api/attendance/[...path]/route.test.ts`
- Modify: `apps/web/src/components/app-shell.tsx`
- Test: `apps/web/src/lib/navigation.test.ts` if navigation behavior is covered there

**Interfaces:**
- `listAttendanceSchools(): Promise<AttendanceSchool[]>`.
- `listAttendanceSessions(schoolId): Promise<AttendanceSession[]>`.
- `listAttendanceSections(schoolId, sessionId): Promise<AttendanceSection[]>`.
- `readAttendanceRegister(schoolId, sessionId, date, sectionId): Promise<AttendanceRegisterData>`.
- `saveAttendanceRegister(schoolId, sessionId, date, sectionId, entries): Promise<AttendanceRegisterData>`.
- The server page checks the existing session helper and redirects unauthenticated users; the client derives control visibility only from API capability flags.

- [ ] **Step 1: Read the required UI guidance and write failing web tests**
  - Read `DESIGN.md`, the repository `.agents/skills/shadcn/SKILL.md`, and the installed Next.js 16 App Router docs before implementation.
  - Reuse installed Base UI `Select`, `Table`, `Button`, `Badge`, `Card`, `Skeleton`, `Empty`, `Alert`, `Tabs`, and toast primitives where useful; consult the shadcn MCP registry only if a required component is absent.
  - Test school/session/date/section selection, roster statuses, bulk present/absent, incomplete/complete state, read-only controls, readable change history, errors/toasts, and narrow layout.
  - Test proxy allowlisting, CSRF/session header forwarding, query preservation, body size limit, and unknown route rejection.
- [ ] **Step 2: Run the focused web tests and confirm failures**
  - Run: `pnpm --filter @classloom/web test -- src/app/attendance/attendance-client.test.tsx src/app/api/attendance/[...path]/route.test.ts`
  - Expected: Attendance page, API client, and proxy route are absent.
- [ ] **Step 3: Implement the Attendance API client and same-origin proxy**
  - Reuse `people-enrollment-request.ts` and the timetable proxy's allowlist/body-size/error-envelope patterns, adding only the documented GET and PUT paths.
  - Forward only cookie, origin, referer, CSRF marker, and content type; use `cache: 'no-store'`.
- [ ] **Step 4: Implement the protected responsive register page**
  - Use the selected school's timezone for the default date, not `new Date().toISOString().slice(0, 10)`.
  - Provide individual status selection, explicit bulk actions, and a read-only change-history view; keep status changes local until the complete roster is saved.
  - Render a desktop roster table and narrow stacked rows using semantic installed primitives, with keyboard labels/focus and loading, empty, incomplete, complete, and error states.
  - Add the active Attendance navigation link and remove its disabled “coming later” entry.
- [ ] **Step 5: Run focused web checks**
  - Run: `pnpm --filter @classloom/web test -- src/app/attendance/attendance-client.test.tsx src/app/api/attendance/[...path]/route.test.ts`
  - Run: `pnpm --filter @classloom/web lint` and `pnpm --filter @classloom/web typecheck`.
  - Expected: focused tests and checks pass at desktop and narrow test viewports.
- [ ] **Step 6: Commit the web slice**
  - Commit with `feat: add daily attendance workspace`.

### Task 5: Documentation and end-to-end verification

**Files:**
- Create: `docs/product/phase-9-attendance.md`
- Modify: `docs/product/mvp-scope.md`
- Modify: `docs/architecture/module-boundaries.md`
- Modify: `docs/architecture/identity-and-access.md`
- Modify: `docs/development/local-setup.md` only if the attendance migration adds a new setup command or required local operation

- [ ] **Step 1: Document the shipped workflow and security boundary**
  - Record statuses, school-local date handling, session/section workflow, correction audit, teacher assignment limits, and the campus-grant limitation.
  - Update module ownership and the MVP phase status without listing unimplemented features as active.
- [ ] **Step 2: Apply and verify the migration locally**
  - Run: `pnpm exec dotenv -e .env -- pnpm db:migrate`
  - Run: `pnpm exec dotenv -e .env -- pnpm db:setup-runtime-role`
  - Run: `pnpm exec dotenv -e .env -- pnpm db:check`
  - Inspect that the restricted runtime role can use Attendance under tenant context and cannot read another tenant's data.
- [ ] **Step 3: Run final package and workspace checks**
  - Run DB, API, and web test suites separately with `.env` loaded where PostgreSQL is required, then run `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
  - Expected: all reported checks complete successfully; record any environment limitation instead of claiming a skipped check passed.
- [ ] **Step 4: Smoke-test the local application**
  - In the signed-in local app, record a synthetic daily roster, reload it, correct one status, and confirm the correction history and completion counts.
  - Verify narrow and desktop layouts and confirm a teacher sees only assigned sections.
- [ ] **Step 5: Commit documentation and final verified changes**
  - Commit with `docs: document phase 9 attendance` after all package checks pass.
