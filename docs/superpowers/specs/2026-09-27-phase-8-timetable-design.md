# Phase 8 — Timetable design

## Goal

Let authorized school staff build and publish a recurring weekly timetable for an academic session. Staff can view the schedule by section or teacher, resolve scheduling conflicts before they save, and keep an unpublished draft separate from the version available to read-only users. Local developers can populate the timetable with deterministic synthetic data using Faker.

This phase implements the weekly timetable domain in the existing modular monolith. It does not add daily substitutions or one-off schedule exceptions.

## Ownership and boundaries

The Timetable module owns timetable records, weekly slots, publication state, schedule validation, school-scoped API routes, and audit records. Academics continues to own sessions, classes, sections, subjects, and teacher assignments. Timetable validates these references through an explicit Academics application contract; it does not use Academics tables as an integration API. People continues to own teacher profiles and account eligibility. A slot may remain unassigned, but an assigned teacher must use an eligible existing Academic teacher assignment for the same section and subject.

Each timetable belongs to one tenant, school, and academic session. A school can have at most one timetable for a given session. Days are Monday through Sunday. Slot times are local wall-clock times for the school's recurring week; they are not converted between time zones. Each slot contains one section, subject, optional teacher assignment, start/end time, and optional room label. Campus-specific variants are not part of this release.

## Lifecycle and conflict rules

A timetable starts as a draft. Managers can add, edit, and remove slots. Publishing makes the complete schedule available to users with read permission. Any subsequent edit returns the timetable to draft; read-only users see it again after it is republished. A publish action validates every slot and publishes atomically.

The API validates `startTime < endTime` and rejects intersecting slots on the same day when they share a section, assigned teacher, or non-empty room label. Room comparison is trimmed and case-insensitive. Adjacent slots are allowed. All timetable mutations lock the parent timetable row inside the tenant transaction before checking overlaps, so concurrent edits cannot bypass conflict checks. Conflict responses identify the conflicting section, teacher, or room without exposing records from another school.

An assigned slot must reference an existing teacher assignment matching its timetable session, section, and subject. That teacher must still be eligible for new academic assignments at the school. An unassigned slot has no teacher assignment and appears with an explicit “Teacher unassigned” label. The development seeder may create such slots without creating accounts or credentials.

## Authorization and tenant safety

Add school-scoped `timetable.read` and `timetable.manage` permissions. Tenant and school administrators may manage schedules. Principals, teachers, and auditors may read published schedules; the existing role templates receive only the specific timetable grants appropriate to their role. API authorization is authoritative; hidden actions in the web client are only a presentation choice.

Every timetable table has a non-null tenant ID, forced RLS, tenant-scoped keys and references, and runtime grants in a new migration. All reads and writes run inside the active server membership's tenant context. School IDs and session IDs supplied by the client are validated against that authenticated tenant and school.

## Persistence and API

Add a parent timetable table keyed uniquely by tenant, school, and academic session, with draft/published status, publication timestamp, create/update timestamps, and actor attribution. Add child slots with tenant/school/session references, section and subject references, optional academic teacher-assignment reference, day-of-week, local start/end times, optional room label, optional reserved demo key, and actor attribution. A tenant/school/session-scoped unique constraint on non-null demo keys supports safe idempotent seeding. Add indexes for school/session and section/day/time lookups, composite foreign keys, checks for legal weekday/time/status values, forced RLS policies, runtime-role grants, and audit coverage. Keep creation of a timetable lazy until the first manager action; reading an unconfigured session returns an empty state without writing.

Expose only same-origin web proxy routes for the documented Timetable API. The API provides:

- School capabilities for `timetable.read` and `timetable.manage`.
- List/read timetable data for a school session, including schedule-ready section/subject/teacher options from Academics contracts.
- Create, update, and delete draft slots.
- Publish the whole timetable after conflict and reference validation.
- A teacher-filtered view over published timetables.

Mutations use the existing authenticated server session, exact-origin/CSRF protection, strict Zod validation, and the standard error envelope. Conflict and invalid-reference errors use clear `409` and `400` responses; records outside authorized school scope are not disclosed.

## Web experience

Add a protected `/timetable` page and an active sidebar item. The page uses the selected school and academic session, with filters for section and teacher. Desktop presents a week grid with day columns and time-ordered slot cards. Narrow viewports present one weekday at a time with the same ordered cards. Managers can create, edit, and delete slots in a shadcn Base UI form and explicitly publish; the page shows the draft/published state and warns when editing will unpublish a schedule. Read-only users can browse published schedules but cannot mutate them.

Reuse installed shadcn Base UI components and semantic tokens (Card, Badge, Select, Input, Tabs, Dialog, Alert, Skeleton, Button, and Empty). No new component or UI framework is required. Forms show field-level validation and readable conflict messages; toast feedback follows existing success/error patterns. Preserve keyboard access, visible focus, responsive layout, loading/error/empty states, and school/session context.

The visual review also identified a desktop-only clipped Admissions search placeholder. Widen that search field in the existing filter grid while preserving the narrow layout.

## Faker development data

`@faker-js/faker` is already a development dependency of `@classloom/db`. Add a separate `seed-phase8-demo` command with explicit `--tenant`, `--school`, and `--session` target arguments and a deterministic `--seed`. The command refuses production mode and is never run by migrations, app startup, or ordinary tests. It resolves the selected target and an active audit actor through the trusted provisioner connection, then writes through `withTenantContext`.

The seeder uses the selected session's existing demo classes and sections. It creates missing reserved `DEMO-TT-*` subjects through the existing Academic repository contract and adds deterministic timetable slots with generated weekdays, times, and room labels. It uses an eligible preexisting teacher assignment when one exists; otherwise slots remain unassigned. It creates no accounts, credentials, invitations, staff profiles, or non-demo records. Reserved demo keys make reruns idempotent, and conflicting non-demo slots are preserved. Missing session/class/section prerequisites produce a clear setup error.

## Error handling and observability

Map database uniqueness and foreign-key failures into the established conflict/validation envelope. Never return raw SQL errors. Include actor and tenant-scoped audit records for slot changes and publication in the same transaction as the timetable mutation. Logs must not include student data or privileged database connection details.

## Verification

- Unit tests cover validation, repeatable Faker fixtures, slot overlap rules, room normalization, publication transitions, and readable conflict messages.
- DB integration tests verify forced RLS, absent tenant context, cross-tenant and cross-school references, tenant-scoped foreign keys, transactional publication, and concurrent conflict serialization.
- API end-to-end tests cover authentication, CSRF, school permissions, role grants, slot lifecycle, publication visibility, teacher filtering, invalid assignments, and section/teacher/room conflicts.
- Web tests cover loading/empty/error states, filters, manager controls, published read-only views, validation/toasts, and desktop/narrow responsive rendering.
- Seeder tests cover required explicit targets, production refusal, deterministic output, `DEMO-TT-` ownership, idempotency, collision preservation, and no account/credential/invitation writes.
- Run the migration locally and smoke-test the seeded timetable in the signed-in development application.

## Out of scope

Daily substitutions, one-off date overrides, rotating week cycles, transport/bus schedules, student or guardian portal access, attendance recording, room inventory, bell-schedule authoring, timetable imports, automatic teacher-account creation, and broad redesign of Academic Setup are not part of Phase 8.

## Completion criteria

Authorized staff can manage and publish a conflict-free weekly timetable for an existing academic session; read-only users can see only published schedules by section or teacher; all tenant and school access is enforced server-side and by forced RLS; the UI is usable at desktop and narrow widths; and deterministic, explicitly targeted Faker seeding populates demo schedules without creating accounts or altering non-demo data.
