# Phase 9: Attendance design

## Goal

Let authorized school staff record, review, and correct daily attendance for students enrolled in a section. A complete register is saved atomically, readers can see whether a section's register is complete, and every attendance change has a traceable audit event.

This release records one roll call per school-local date, academic session, and section. It does not record attendance by timetable period.

## Scope

Phase 9 adds the Attendance domain to the existing modular monolith: tenant-owned storage, school-scoped API, authorization, web workflow, validation, audit history, and tests. It consumes existing Enrollment, Academics, and People contracts. The initial statuses are `present`, `absent`, `late`, and `excused`.

Daily corrections are allowed and audited. Staff may record current or past dates inside an academic session, but not future school-local dates. The initial release has no student or guardian attendance portal, period attendance, notifications, analytics, exports, excuse-document workflow, or attendance import.

## Ownership and module boundaries

Attendance owns daily registers, per-student statuses, validation, school-scoped routes, and immutable status-change events. A register is identified by tenant, school, academic session, section, and date. It stores the academic enrollments whose attendance was recorded and derives its completion state from the current eligible roster for that date.

Enrollment supplies the section roster as of the requested school-local date through a narrow application contract. Attendance does not query Enrollment tables directly. Academics validates the session and section and supplies section assignments for an actor through a contract. People identifies whether an account membership has a linked teacher profile and whether that profile remains eligible at the school. Attendance does not use Academics, Enrollment, or People tables as integration APIs.

The roster is based on academic enrollment effective dates: an enrollment is included when its start date is on or before the attendance date and it has no end date before that date. The stored attendance entry references the academic enrollment and student using tenant-safe keys. Reads show enrolled students with their saved status, or an unmarked state when no status is stored. A save must submit exactly one valid status for every student in the authoritative roster; omitted, duplicate, or out-of-roster enrollment IDs reject the whole request.

## Workflow and lifecycle

1. A member chooses an accessible school, academic session, date, and section.
2. The API returns the section roster effective on that date, saved statuses if present, completion counts, and the section choices visible to that member.
3. Staff mark the roster individually or use a bulk status action, then save the complete roster in one request.
4. The API validates the date, session, section, roster, status values, and actor access inside the authenticated tenant transaction, then writes all changes atomically.
5. Authorized staff can correct a saved register for the same date. The API records each changed student's before/after status, actor, request ID, and timestamp in the same transaction.

An unsaved or partially marked roster remains incomplete; there is no separate draft or approval state. Status is explicit, so a missing attendance row never means absent. A register with no active students is shown as an empty roster and cannot be mistaken for a completed class roll call.

The server uses the school's configured timezone to determine the current school date and reject future attendance. The selected date must be within the selected academic session's date range. The date is stored as a PostgreSQL date and is not converted through the browser timezone.

## Authorization and tenant safety

The existing `attendance.read` and `attendance.record` keys become school-scoped because attendance registers are owned by school sections and sections have no campus identifier. `attendance.read` permits reading visible registers; `attendance.record` permits saving and correcting them. Tenant or school role grants can cover the school. A campus-only grant does not silently expand to cover the whole school; a member with only a campus grant must receive an appropriate school-scoped grant before using the school register.

The API checks permissions on every request and derives tenant and actor identity only from the authenticated active membership. For a membership linked to a teacher profile, Attendance filters readable and recordable sections to active teacher assignments for the selected session, resolved through Academics and People contracts. Other authorized attendance readers and operators use the school scope granted to them. Missing membership, school grant, teacher eligibility, or unresolved academic scope fails closed. UI visibility is not an authorization boundary.

Every attendance table has a non-null tenant ID, forced RLS, tenant-scoped uniqueness, composite foreign keys, and least-privilege runtime grants. All reads and writes run inside `withTenantContext`. Register serialization prevents two concurrent full-roster saves from bypassing validation. Status changes and their audit events commit or roll back together. Audit history stores record identifiers and status values, not student names or free-text health details.

## Data model

Add a register parent table keyed uniquely by tenant, school, academic session, section, and attendance date. Add student status records keyed by tenant, register, and academic enrollment, with a checked status value and timestamps. Add immutable status-change events with tenant/register/enrollment references, actor membership/account, request ID, old and new status, and event timestamp. Composite constraints ensure the session and section belong to the same school and the student enrollment belongs to the same tenant and school. Indexes support school/date/session/section reads and per-enrollment history.

The migration adds forced RLS policies and runtime grants for the new tables and updates the system attendance permission catalog to school scope. Existing migrations are not rewritten.

## API and web experience

The API provides:

- Accessible-school capabilities for reading and recording attendance.
- Session and section choices visible to the active member.
- Register read by school, academic session, date, and section, including roster statuses and completion counts.
- Atomic full-roster save and correction using strict request validation.
- Read-only attendance history for authorized school members.

Mutating browser requests use the existing same-origin proxy, exact-origin validation, and `X-ClassLoom-Request: 1` marker. Errors use the standard envelope and clearly identify invalid dates, stale rosters, inaccessible sections, and conflicting updates without exposing cross-tenant records.

Add a protected `/attendance` page and active sidebar link. The page supports school, session, date, and section selection; per-student status controls; bulk present/absent actions; completion counts; and clear save and error feedback. Desktop uses a roster table, while narrow screens use stacked student rows. Readers without record permission cannot mutate statuses. Loading, empty, incomplete, complete, and error states are explicit. Reuse installed shadcn Base UI components and project tokens; add no unrelated UI library.

## Error handling and observability

Duplicate, stale, missing, or out-of-scope roster entries fail the complete save with a readable validation or conflict response; the API never partially writes a register. Database constraint failures map to the existing error envelope. Logs omit student names, health information, credentials, and privileged connection details. Audit events contain status transitions and actor/request attribution only.

## Verification

- Unit tests cover date/timezone boundaries, status validation, roster set validation, completion calculation, and authorization filtering.
- Database integration tests cover migration, forced RLS, absent tenant context, cross-tenant and cross-school denial, tenant-safe enrollment references, atomic saves, serialization, and audit rollback.
- API end-to-end tests cover authentication, CSRF, school permission scopes, teacher assignment restrictions, roster changes, future and out-of-session dates, duplicate or missing entries, correction history, and full-save rollback.
- Web tests cover school/session/date/section selection, status editing, bulk actions, complete/incomplete indicators, read-only users, loading/empty/error states, toasts, and desktop/narrow layouts.
- Apply the migration locally and smoke-test one demo section's daily register using synthetic students only.

## Completion criteria

Authorized staff can record a complete daily section roll call for a valid school date; linked teachers are limited to their assigned sections; readers see only the registers allowed by their school scope; corrections retain an immutable history; tenant and school access is enforced by the API and forced RLS; and the interface works at desktop and narrow widths.
