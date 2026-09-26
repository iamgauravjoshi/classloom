# Phase 5 — Staff and teacher profiles design

## Goal and scope

Give school administrators a usable staff directory and teacher profiles while keeping people separate from login accounts. A staff member can work at several schools in one tenant with one identity and separate school affiliations. Staff can exist before receiving a login account. This phase covers staff and teachers only; students, guardians, enrollment, admissions, HR, and payroll remain outside this scope.

An active teacher must have a linked active tenant membership to receive a new academic class assignment. Existing Phase 4 assignments remain attached to their membership IDs and are not rewritten.

## Data model

- `staff_profiles` owns one tenant-wide person record: tenant-unique staff code, given and family names, optional preferred name, work email and phone, and an optional unique link to a membership in the same tenant. The staff code is immutable after creation. A profile is not a user account and creating one does not create credentials or send an invitation.
- `staff_school_affiliations` connects a staff profile to a school in the same tenant. It holds the school-specific designation, optional start date, kind (`staff` or `teacher`), and status (`active` or `inactive`). A staff member has at most one affiliation per school. Inactivation preserves history.
- `teacher_profiles` holds optional, bounded qualification and specialization text for a staff profile. A school affiliation can be marked `teacher` only when this record exists. The teacher record can be created when the staff record is created or when a staff member becomes a teacher. Phase 5 does not remove teacher records; school affiliation status and kind control current eligibility.
- Every new tenant-owned table has a non-null tenant ID, forced RLS, composite foreign keys for tenant and school relationships, tenant-scoped uniqueness, and runtime-role grants. Add schema through Drizzle generation and review the resulting SQL. No destructive migration or automatic backfill of people from accounts occurs.

The linked membership must belong to the same tenant and be active, with an active account. It must have a tenant or school role grant for every active school affiliation at the time of linking or adding an affiliation. One membership cannot be linked to two staff profiles in the tenant. Relinking or unlinking is rejected while academic assignments reference the current membership, so historical assignments never silently appear to belong to a different person. Inactive or suspended accounts remain linked but cannot receive new assignments.

## Ownership and authorization

The new People module owns staff and teacher rules, persistence operations, and its API. The Academics module continues to own section and subject assignments. It asks an explicit People service contract, inside the same tenant transaction, whether a membership is an active, linked teacher at that school before creating a new assignment. The existing academic membership and school-grant checks remain in force. Existing assignments, including those created before a staff profile existed, remain readable with their account label.

Add school-scoped `staff.read` and `staff.manage` permissions. Tenant administrators receive both through their built-in role; school administrators receive both at their granted schools; principals and auditors receive read access; ordinary teachers receive neither by default. The migration seeds the new catalog entries and backfills existing built-in tenant roles; new tenants receive the same permissions through role templates. Custom roles can be granted these permissions through the existing authorization flow.

API handlers derive the tenant from the active server session and check permission on each requested school. Directory responses include only affiliations at schools the caller may read. Editing a school affiliation needs `staff.manage` at that school. Editing shared profile fields, teacher details, or the login link needs `staff.manage` at every current affiliated school, which a tenant-wide grant satisfies. This prevents one school's administrator from changing shared identity data used by another school. Adding an affiliation requires read access to the source profile and `staff.manage` at the destination school. Cross-tenant and cross-school references fail closed. Staff create, edit, affiliation, status, and account-link changes write an audit event in the same transaction; audit metadata contains IDs and change types, not contact details.

## API and web flow

The versioned REST API uses `/api/v1/people/schools/:schoolId/staff` for a paginated list (`q`, `status`, `kind`, `cursor`, `limit`) and creation, and `.../staff/:staffId` for detail and permitted edits. The `PATCH` body separates `profile` from `affiliation` fields so the server applies the different permission checks. `POST .../staff/:staffId/affiliations` adds another school affiliation, with `targetSchoolId` in the body and read permission at the source school. `PUT .../staff/:staffId/teacher` creates or updates teacher details. `PUT` and `DELETE .../staff/:staffId/account` link or unlink an eligible membership. `GET /api/v1/people/schools/:schoolId/eligible-accounts` requires `staff.manage`, lists active memberships with a grant in that school, and excludes accounts already linked to another staff profile. Inactivation is an affiliation edit; no hard-delete endpoint is added. Mutations use the existing auth, exact-origin and CSRF checks. Zod validation produces field-specific messages; duplicate codes, duplicate affiliations, invalid links, or blocked relinks produce clear conflict messages. The same-origin web proxy uses an explicit route and method allowlist and bounded request bodies.

The protected `/staff` page uses the existing ClassLoom shell and the live PreSkool visual language. It provides a school selector, searchable and filterable directory, clear empty and loading states, a profile view, create and edit forms, school-affiliation management, teacher details, and account linking. The academic setup teacher picker uses linked, active teacher profiles by name; existing assignments retain a readable account fallback. Forms show field errors and the application's animated success and error toasts.

The shadcn project uses the `base-nova` Base UI style. Existing `Button`, `Card`, `Table`, `Badge`, `Avatar`, `Field`, `Input`, `Select`, `Dialog`, `Alert`, `Skeleton`, `Toast`, and date-field composition cover this flow. The shadcn MCP registry and examples were inspected; no new component is currently required. If a specific component becomes necessary during implementation, search it with the shadcn MCP, preview the project-aware CLI addition, and keep the Base UI implementation. Do not add Radix or another UI library.

## Verification and documentation

- Unit tests cover staff normalization, permission decisions, account-link and teacher eligibility rules, and useful validation errors.
- PostgreSQL integration tests use the restricted runtime role to prove RLS isolation, composite-key protection, school visibility, uniqueness, account-link rules, and audit atomicity.
- API end-to-end tests cover unauthenticated and unauthorized requests, multi-school scope, cross-tenant references, profile lifecycle, eligible accounts, and new versus historical academic assignments.
- Web checks cover form validation and the directory's loading, empty, success, and error states. Run relevant lint, typecheck, tests, E2E, build, and migration checks; report only commands actually run.
- Update the README and development/architecture documentation for the new flow and record the tenant-wide person and school-affiliation decision in an ADR.
