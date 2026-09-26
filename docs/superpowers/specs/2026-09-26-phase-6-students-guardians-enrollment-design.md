# Phase 6 — Students, guardians, and enrollment design

## Goal and scope

Phase 6 completes the people and enrollment foundation after Phase 5 staff and teacher profiles. School administrators can create tenant-wide student and guardian identities, connect guardians to several students, enroll students in schools and academic placements, preserve placement history, optionally link login memberships, and import students and guardians from CSV.

This phase includes student and guardian directories, profiles, relationships, school enrollment, academic placement, transfers, withdrawals, completion, CSV import, deterministic local demo data, permissions, audit records, tests, and documentation. Admissions, student and guardian portal dashboards, attendance, timetable, fees, examinations, document storage, and messaging remain outside this phase. Phase 7 Admissions will create or connect these records through explicit People and Enrollment contracts.

## Domain ownership and contracts

The existing People module owns tenant-wide identities:

- Student profiles, guardian profiles, and student-guardian relationships.
- Optional links from student or guardian profiles to active memberships in the same tenant.
- Profile normalization, relationship rules, account-link eligibility, and school-scoped visibility.
- CSV operations that create or resolve people records through an explicit transaction-aware application contract.

A new Enrollment module owns school and academic enrollment:

- School-specific admission numbers and school enrollment lifecycle.
- Academic-session, class, and section placement history.
- Transfer, withdrawal, and completion workflows.
- CSV import orchestration across People, Academics, and Enrollment.

Enrollment calls explicit People and Academics application contracts inside the tenant transaction. It does not read another module's tables as an implicit API. Academics resolves and validates the school, academic session, class, and section hierarchy. People validates or creates student, guardian, and relationship records. This one-way dependency avoids circular module imports and gives the future Admissions module stable contracts for student conversion and initial enrollment.

## Data model

### Tenant-wide people

`student_profiles` stores one tenant-wide identity per student:

- Tenant-unique, case-insensitive, immutable student code.
- Given, middle, family, and optional preferred name.
- Date of birth and bounded optional demographic and contact fields needed by the school profile.
- Status (`active` or `inactive`).
- Optional membership link to an active membership in the same tenant.
- Creation and update timestamps.

`guardian_profiles` stores one tenant-wide identity per guardian:

- Tenant-unique, case-insensitive, immutable guardian code.
- Given, middle, family, and optional preferred name.
- Bounded email, phone, occupation, and address fields.
- Status (`active` or `inactive`).
- Optional membership link to an active membership in the same tenant.
- Creation and update timestamps.

Each membership can link to at most one student profile and at most one guardian profile. A membership may also link to a staff profile, allowing a staff member to be a guardian. Creating a profile never creates an account, credentials, membership, invitation, or role grant.

`student_guardian_relationships` connects a student and guardian in the same tenant:

- Relationship type such as mother, father, legal guardian, grandparent, sibling, or other.
- Primary-contact, emergency-contact, authorized-pickup, financial-responsibility, and portal-access flags.
- Status (`active` or `inactive`) and timestamps.
- At most one relationship record for the same student and guardian; changes preserve audit history.

One guardian can relate to several students and one student can have several guardians. Relationship flags belong to the individual student-guardian link and can differ for siblings.

### School and academic enrollment

`student_school_enrollments` records each durable period in which a student belongs to a school:

- Tenant, school, and student identifiers.
- School-specific, case-insensitive admission number.
- Admission date, optional leaving date and reason.
- Status (`active`, `withdrawn`, `transferred`, or `completed`).
- At most one active school enrollment per student and school.

A student who leaves and later returns receives another historical school-enrollment record. Admission numbers remain unique within a school and are never moved to another student.

`student_academic_enrollments` records placement history:

- The owning school-enrollment record.
- Academic session, class, and section in the same tenant and school.
- Optional school-specific roll number.
- Start date, optional end date and reason.
- Status (`active`, `transferred`, `withdrawn`, or `completed`).
- At most one active placement for a student in a school and academic session.
- An active roll number is unique within a section when present.

A class or section move closes the current placement as transferred and creates a new active placement in the same transaction. Withdrawal and completion close the placement without deleting it. Draft and active academic sessions accept new placement; archived sessions are read-only. Composite foreign keys prevent cross-tenant, cross-school, cross-session, and class-section mismatches.

Every new tenant-owned table has a non-null tenant ID, forced row-level security, tenant-safe composite foreign keys, tenant-scoped uniqueness, useful indexes, and restricted runtime-role grants. Schema changes are generated through Drizzle and added as a new migration without modifying applied migrations.

## Authorization, visibility, and account links

Add these school-scoped permission families:

- `student.read` and `student.manage`
- `guardian.read` and `guardian.manage`
- `enrollment.read` and `enrollment.manage`

Tenant administrators and school administrators receive manage permissions through built-in role templates. Principals and auditors receive read permissions. Teachers do not receive school-wide student permissions in this phase because a school-scoped grant would expose students outside their assigned classes. Teacher access can be added later when an academic relationship resolver can restrict records to assigned sections.

Student and guardian directories are requested in a school context. A student is visible through a school-enrollment record at that school. A guardian is visible only through an active or historical relationship to a student visible at that school. Editing shared student or guardian profile fields or account links requires manage access at every school where the person currently has an active relationship. Enrollment changes require manage access at the owning school. Tenant-wide grants satisfy all-school checks.

An account link must reference an active membership in the same tenant. A membership cannot link to a second profile of the same type. Linking an account does not grant business permissions. Student and guardian portal routes, dashboards, and relationship-scoped authorization remain deferred; unsupported relationship permission scopes continue to fail closed.

No domain record receives a hard-delete API. Profiles and relationships are inactivated, while enrollment workflow actions close records with dates and bounded reasons. Account relinking is rejected when it would make established portal or audit history ambiguous. Each create, update, relationship, account-link, transfer, withdrawal, completion, and import operation writes a security audit event in the same transaction. Audit metadata contains identifiers, action types, statuses, and counts rather than names, birth dates, emails, phone numbers, addresses, or raw CSV fields.

## API surface and behavior

People routes follow the existing versioned, school-scoped API pattern:

- `GET|POST /api/v1/people/schools/:schoolId/students`
- `GET|PATCH /api/v1/people/schools/:schoolId/students/:studentId`
- `GET|POST /api/v1/people/schools/:schoolId/guardians`
- `GET|PATCH /api/v1/people/schools/:schoolId/guardians/:guardianId`
- `POST /api/v1/people/schools/:schoolId/students/:studentId/guardians`
- `PATCH /api/v1/people/schools/:schoolId/students/:studentId/guardians/:relationshipId`
- `GET /api/v1/people/schools/:schoolId/eligible-accounts?profileType=student|guardian`
- `PUT|DELETE /api/v1/people/schools/:schoolId/students/:studentId/account`
- `PUT|DELETE /api/v1/people/schools/:schoolId/guardians/:guardianId/account`

List routes use bounded cursor pagination and support search and status filters. Student lists can also filter by academic session, class, and section through an explicit Enrollment query contract rather than reading Enrollment tables directly.

Enrollment routes expose workflows rather than arbitrary status mutation:

- `GET|POST /api/v1/enrollment/schools/:schoolId/students/:studentId/school-enrollments`
- `GET|POST /api/v1/enrollment/schools/:schoolId/school-enrollments/:schoolEnrollmentId/academic-enrollments`
- `POST /api/v1/enrollment/schools/:schoolId/academic-enrollments/:enrollmentId/transfer`
- `POST /api/v1/enrollment/schools/:schoolId/academic-enrollments/:enrollmentId/withdraw`
- `POST /api/v1/enrollment/schools/:schoolId/academic-enrollments/:enrollmentId/complete`

The transfer endpoint accepts the destination session, class, section, effective date, optional roll number, and reason. State transitions are serialized on the current enrollment row so concurrent attempts cannot create two active placements.

All endpoints derive tenant identity from the authenticated active membership, resolve school scope on the server, enforce declared permissions at the API boundary, and run tenant-owned work inside `withTenantContext`. Zod schemas return field-specific messages. Duplicate codes or admission numbers, invalid academic hierarchies, invalid state transitions, blocked account links, and concurrency conflicts return clear conflict or validation errors through the existing error envelope. Browser mutations retain the exact-origin and `X-ClassLoom-Request: 1` protections.

## CSV bulk import

The Enrollment module owns a preview-first student import workflow because the final operation creates school and academic enrollment while coordinating People and Academics contracts:

- `POST /api/v1/enrollment/schools/:schoolId/imports/students/inspect`
- `POST /api/v1/enrollment/schools/:schoolId/imports/students/preview`
- `POST /api/v1/enrollment/schools/:schoolId/imports/students/commit`

Inspect accepts a UTF-8 CSV and returns detected headers and bounded sample rows. Preview accepts the same file plus an explicit column mapping, parses and normalizes every row, resolves codes, groups repeated student rows, and reports row and field errors without writing domain records. Commit accepts the same file and mapping, recomputes its checksum, repeats all validation, and commits the complete import atomically. If any row is invalid, no student, guardian, relationship, or enrollment is written.

The first version accepts comma-delimited UTF-8 files up to 2 MiB and 1,000 data rows. Required mappings are student code, student given name, student family name, date of birth, admission number, academic-session code, class code, and section code. Roll number and additional student fields are optional. Guardian fields are optional, but guardian code, given name, family name, and relationship type are required when any guardian field is present.

Each row represents a student and at most one guardian relationship. Repeated student rows support multiple guardians, and repeated guardian codes support siblings. Repeated shared fields must agree across rows. Existing student or guardian codes can be referenced, but the import never silently overwrites existing shared identity fields; conflicting values are preview errors. Existing compatible people may receive a new relationship or enrollment through the import.

Commit requires `student.manage`, `guardian.manage`, and `enrollment.manage` at the target school. `student_import_batches` stores only tenant, school, checksum, idempotency key, actor, status, counts, timestamps, and failure category. It does not store raw files, mapped personal data, or row contents. A tenant-and-school-scoped idempotency key returns the prior successful result on retry and rejects reuse with a different checksum or mapping. Raw uploads are bounded at both the Next.js proxy and API.

## Web interface and shadcn composition

The protected web application adds:

- `/students`: school-scoped student directory with search, status, session, class, and section filters; cursor pagination; and Add Student and Import CSV actions.
- `/students/new`: full-page creation flow for student identity, initial school enrollment, initial academic placement, and optional guardian relationships.
- `/students/[studentId]`: profile header and Overview, Guardians, Enrollment History, and Account Access tabs.
- `/guardians`: searchable, school-scoped guardian directory.
- `/guardians/[guardianId]`: guardian details, linked students, responsibilities, and account access.
- `/students/import`: Upload, Map Columns, Preview and Fix, and Import Result steps.

The UI follows the existing ClassLoom shell and PreSkool-inspired visual system. It uses semantic tokens and the configured shadcn `base-nova` Base UI style. Existing Button, Card, Table, Badge, Avatar, Field, Input, Select, Dialog, Alert, Skeleton, Toast, Calendar, and Popover components are reused. The shadcn MCP registry was inspected for the missing Tabs, Checkbox, Progress, Pagination, Empty, and Textarea components. Add only the Base UI versions that the implemented flow needs, preview the project-aware changes before installation, and review generated files. Do not add Radix primitives or another component library.

Forms use `FieldGroup`, `Field`, labels, descriptions, `data-invalid`, and `aria-invalid`. Guardian responsibilities use Checkbox fields. Destructive-looking lifecycle actions use Dialog or AlertDialog with a title and clear consequence. Mutating buttons use Spinner and disabled state. Skeleton, Alert, Empty, Badge, Toast, and detailed inline errors cover loading, errors, empty results, statuses, and success without relying on toasts alone.

The import page keeps the file in browser memory between steps, displays mapped and unmapped fields, shows row and column error context, paginates the preview, and asks for a final commit action after a clean preview. It announces progress and errors accessibly. Directories and profile pages remain usable on narrow screens, preserve keyboard operation and visible focus, and avoid low-contrast gray text.

## Deterministic development data

Add `@faker-js/faker` as a development-only dependency in the package that owns the demo seed command. A trusted command accepts an explicit development tenant and school, refuses production mode, and creates deterministic synthetic Phase 6 data with a fixed Faker seed and reserved `DEMO-` codes.

The seed includes students, guardians, siblings, relationship responsibilities, school enrollment, current and historical academic placements, and active, transferred, withdrawn, and completed examples. It may link eligible existing demo memberships when explicitly requested, but it never creates credentials or invitations. Rerunning the command is idempotent and does not modify non-demo records. The seeder is never invoked by migrations, application startup, tests against production-like data, or normal deployment.

## Verification and documentation

- Unit tests cover profile normalization, relationship rules, visibility decisions, account-link eligibility, enrollment transitions, CSV parsing and mapping, repeated-row grouping, validation messages, checksums, and idempotency behavior.
- PostgreSQL integration tests run through the restricted runtime role and prove forced RLS, absent-context denial, cross-tenant and cross-school rejection, composite references, unique codes and admission numbers, relationship visibility, one-current-enrollment constraints, roll-number uniqueness, audit atomicity, and pooled-connection isolation.
- Concurrency tests prove simultaneous initial enrollments and transfers cannot produce two active placements.
- API end-to-end tests cover unauthenticated and unauthorized requests, school scope, profile and relationship lifecycle, account links, enrollment workflows, archived-session rejection, import inspection, validation, atomic commit, retry behavior, and useful error envelopes.
- Web tests cover API helper encoding and CSRF behavior, directories, filters, forms, profile tabs, lifecycle dialogs, CSV steps, loading and empty states, field-error preservation, and success/error feedback.
- Run relevant database generation and migration checks, lint, typecheck, unit and integration tests, API E2E tests, production build, and responsive accessibility checks before completion. Report only checks actually run.
- Update README, module boundaries, multi-tenancy, identity and access, testing, local setup, and Phase 6 workflow documentation. Record the tenant-wide student and guardian identity plus historical school/academic enrollment decision in an ADR.

## Acceptance criteria

Phase 6 is complete when an authorized school administrator can create or import students and guardians, manage their relationships, enroll students in configured academic structures, transfer or close placements without losing history, optionally link eligible accounts, and see clear errors and success feedback. Unauthorized schools and tenants cannot observe or mutate those records, invalid imports write nothing, retries do not duplicate data, the local demo seeder shows realistic synthetic data, and all required verification passes.
