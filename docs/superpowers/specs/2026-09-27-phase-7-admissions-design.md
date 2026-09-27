# Phase 7 — Admissions design

## Goal and scope

Phase 7 adds a staff-managed admissions workflow for each school. Staff can record an enquiry, prepare and submit an application, review it, record an acceptance or rejection, and explicitly convert an accepted application into a current student and enrollment. Admission cases remain separate from enrolled student records until conversion. Each case belongs to one school and is processed by staff with school-scoped permission.

The workflow includes enquiry capture, application and guardian details, status changes, review history, admissions directories and case detail screens, a final admission conversion action, authorization, audit events, tests, and documentation. Family-facing/public application access, document uploads, automatic email, waitlists, payments, and automatic conversion are deferred. Existing direct student admission and CSV student import remain available and are not replaced by this workflow.

## Domain ownership and contracts

The Admissions module owns:

- School-scoped admission cases and applicant/application details before conversion.
- Case lifecycle rules, reviewer decisions, and immutable status event history.
- Admissions search and worklist queries.
- Conversion orchestration and admission-specific validation.

People continues to own tenant-wide student and guardian identities, including normalization and shared identity resolution. Enrollment continues to own school admission records and academic placements. Admissions calls explicit People and Enrollment application contracts within one tenant transaction; it does not read or write their tables directly. Academic session, class, and section validation remains owned by Academics through the Enrollment contract. Cross-domain conversion must complete or roll back as one transaction.

## Data model

### Admission case

An `admission_cases` record is tenant- and school-scoped and has a stable opaque ID. It contains:

- A generated, school-unique case reference suitable for staff display.
- Current status, initially `enquiry`.
- Applicant student identity fields needed for conversion: given, middle, family, and preferred names; date of birth; gender; email; and phone where supplied.
- Optional existing student profile reference when staff intentionally links a known person; the reference is validated through the People contract and must belong to the same tenant.
- Applicant guardian contact/details and relationship responsibility fields, supporting up to 10 guardians.
- Application metadata such as requested academic session, class, and section, where configured; these are references resolved through Academics rather than free-form IDs trusted from the browser.
- Optional review note and decision note with bounded lengths.
- Optional final conversion references to the created or linked student, school enrollment, and initial academic enrollment.
- Created/updated timestamps and actor IDs for lifecycle actions.

Application data is retained after admission or rejection so staff can understand what was reviewed. Personal data is not copied into audit metadata. A school may not hard-delete an admission case through the API. Where case data correction is necessary, updates are allowed only in `enquiry` or `draft`; submitted case changes require an explicit return-to-draft action and event history.

Guardian application details live in up to 10 `admission_case_guardians` rows keyed to the case and school. Each row stores the applicant's guardian identity/contact details, relationship type, and responsibility flags. Rows use tenant-safe foreign keys and forced RLS; an explicitly linked existing guardian profile is validated through People at conversion time.

### Event history

An `admission_case_events` record is appended for each status transition and review/decision action. It contains tenant, school, case, actor membership/account identifiers, previous and new status, event type, timestamp, and bounded non-sensitive reason/category metadata. Event rows are immutable through application APIs. Audit metadata contains identifiers and status values, not names, birth dates, email addresses, phone numbers, or application contents.

Tenant-owned tables use forced RLS, tenant-safe and school-safe foreign keys, scoped uniqueness, useful indexes, and restricted runtime grants. Schema changes use Drizzle and a new migration; previously applied migrations are not edited.

## Authorization and status lifecycle

Add school-scoped permission keys `admissions.read`, `admissions.manage`, and `admissions.convert`:

- Tenant administrators receive all three through their built-in template.
- School administrators receive all three.
- Principals and auditors receive `admissions.read` only.
- A built-in `Admission Officer` role receives read, manage, and convert permissions.
- Custom roles may be assigned these catalog permissions using the existing authorization module.

The API derives tenant context from the authenticated server-side membership, resolves the requested school within that tenant, and enforces permissions on every request. Frontend navigation visibility is not an authorization boundary. Case IDs and any student references are revalidated inside the active tenant transaction.

The allowed transitions are explicit and server-enforced:

| Current status | Allowed next status | Required permission |
| --- | --- | --- |
| `enquiry` | `draft`, `withdrawn` | `admissions.manage` |
| `draft` | `submitted`, `withdrawn` | `admissions.manage` |
| `submitted` | `draft`, `under_review`, `withdrawn` | manage for return/withdraw; manage for review start |
| `under_review` | `draft`, `accepted`, `rejected`, `withdrawn` | `admissions.manage` |
| `accepted` | `admitted` | `admissions.convert` |
| `rejected`, `withdrawn`, `admitted` | none | terminal |

An authorized reviewer may make the final decision; a second-person approval is not required. A decision requires a bounded reason/note. Conversion is a separate action and only an accepted case can be admitted. No client-supplied status patch is accepted; API actions encode the desired workflow transition.

## API surface and behavior

Use versioned school-scoped routes:

- `GET /api/v1/admissions/schools` — list only schools where the active membership has admissions read, manage, or convert access, including `canReadAdmissions`, `canManageAdmissions`, and `canConvertAdmissions` flags for UI choices.
- `GET|POST /api/v1/admissions/schools/:schoolId/cases` — bounded cursor-paginated worklist and create an enquiry or draft.
- `GET|PATCH /api/v1/admissions/schools/:schoolId/cases/:caseId` — read details; edit applicant/application fields only while editable under lifecycle rules.
- `POST /api/v1/admissions/schools/:schoolId/cases/:caseId/draft` — move an enquiry into draft after staff begins its application; status is never patched directly.
- `POST /api/v1/admissions/schools/:schoolId/cases/:caseId/submit` — validate required applicant and requested placement data, then submit.
- `POST /api/v1/admissions/schools/:schoolId/cases/:caseId/review` — start or resume review, or return an under-review case to draft with a reason.
- `POST /api/v1/admissions/schools/:schoolId/cases/:caseId/decision` — accept or reject with a required decision note.
- `POST /api/v1/admissions/schools/:schoolId/cases/:caseId/withdraw` — withdraw an editable or reviewed case with a reason.
- `POST /api/v1/admissions/schools/:schoolId/cases/:caseId/admit` — convert an accepted case into a student, guardian relationships, school enrollment, and initial academic placement.
- `GET /api/v1/admissions/schools/:schoolId/cases/:caseId/events` — read the case event history.

The worklist supports text search across case reference and applicant name, plus status, requested session, and created-date filters. Pagination is bounded. The API returns only school-visible cases and joins display information through Admissions-owned queries or explicit People/Academics contracts.

Conversion accepts the school admission number, admission date, academic session, class, section, and optional roll number; staff may also supply student and guardian codes where new profiles are needed. The API revalidates all fields and references. Existing student links are honored only when explicitly attached to the case or selected during conversion and validated by People. It does not silently match people by name, email, or date of birth. New or linked People records, guardian relationships, school enrollment, initial placement, conversion references, case status `admitted`, and event/audit rows commit atomically. A conflict, stale status, unavailable placement, or uniqueness violation leaves the case and all domain records unchanged.

Every route runs with the active tenant context and the established forced-RLS transaction. Request bodies use strict schemas and field-specific validation. Invalid input returns the existing error envelope with actionable validation details; missing cross-tenant records do not disclose whether the foreign ID exists. Concurrent status changes serialize on the case row; only one valid transition can win. Repeated conversion attempts on an already admitted case return a conflict or the prior conversion result using the persisted conversion references, without creating duplicates.

## Web interface and shadcn composition

Add an Admissions item in the existing ClassLoom navigation and protected pages:

- `/admissions`: worklist with case reference, applicant, status, requested session/grade, created date, search and filters, and a create-enquiry action.
- `/admissions/new`: staff form for a minimal enquiry or a complete draft application.
- `/admissions/[caseId]`: case detail with applicant and guardian information, requested placement, event history, current status, and permitted lifecycle actions.
- The final admission action opens a focused form for admission number/date and the initial academic session, class, section, and optional roll number. It presents the conversion consequence and only reports success after the atomic API action succeeds.

The UI follows `DESIGN.md`, the existing application shell, and the installed shadcn `base-nova` Base UI conventions. Reuse installed components and use the shadcn skill/MCP registry to inspect or add only needed Base UI components. Do not introduce Radix components or another UI library. Forms use the project's field/error patterns, semantic tokens, visible focus, and accessible labels. Loading, empty, success, validation, authorization, stale-state, and conflict states are clear and specific. Status is not implied by color alone. Staff can access actions only when the UI permission data allows them, while the API remains authoritative.

## Verification and documentation

- Unit tests cover allowed and denied status transitions, required decision notes, applicant validation, explicit person-link behavior, conversion input validation, and idempotent/concurrent conversion handling.
- PostgreSQL-backed tests verify forced RLS, cross-tenant and cross-school rejection, composite references, unique case references, atomic rollback across Admissions/People/Enrollment, audit/event atomicity, and pooled tenant-context isolation.
- API end-to-end tests cover unauthenticated and unauthorized access, role grants including Admission Officer, school isolation, worklist filters, create/edit/submit/review/decision/withdraw, invalid transitions, conversion success, failed conversion rollback, duplicate conversion, stale concurrent decisions, and useful validation/conflict errors.
- Web tests cover navigation, worklist search and filters, case creation/editing, status actions, conversion form, loading/empty/error states, responsive layout, and permission-aware action visibility.
- Run database generation and migration checks, lint, typecheck, relevant unit/integration tests, API E2E tests, production build, and responsive/accessibility checks. Report only checks actually run.
- Update README and relevant product and architecture docs, including module boundaries, identity/access, multi-tenancy, local setup, and admissions workflow. Record durable domain ownership or status-lifecycle decisions in an ADR when they materially extend the Phase 6 contracts.

## Acceptance criteria

Phase 7 is complete when authorized school staff can create and search admission cases, capture and edit application information within the permitted lifecycle, submit and review an application, record a single-authorized-reviewer decision, and explicitly convert an accepted case into a student and initial enrollment. Status history is immutable, conversion is atomic and duplicate-safe, no cross-school or cross-tenant access is possible, the existing student/CSV workflows continue to work, and required verification passes.
