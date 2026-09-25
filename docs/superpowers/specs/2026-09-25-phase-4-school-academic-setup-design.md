# Phase 4 — School academic setup design

## Goal

Give an authorized school administrator a working setup flow for academic sessions, classes, sections, subjects, and teacher assignments. A school can activate one session at a time.

## Model and rules

- Every academic record belongs to a tenant and school. Classes and subjects belong to a session; sections belong to a class. Assignments connect a section, subject, and active tenant membership. The membership is an identity link; Phase 5 can attach a teacher profile without rewriting academic assignments.
- Sessions have a unique school code, start and end dates, and status (`draft`, `active`, `archived`). Dates use calendar dates. A session can be activated only if it contains at least one class, section, and subject. Activating one session archives the previous active session atomically. Archived sessions are read only.
- Codes are unique within their parent (session for classes and subjects; class for sections). Names and codes are trimmed and bounded. Assignments are unique per section and subject. A subject must be in the same session as its section; a membership must be active in the same tenant.
- Tenant isolation is enforced with PostgreSQL RLS on every table and composite foreign keys for every academic relationship. The API derives tenant identity from the server session, checks `school.read` or `school.manage` against the requested school, and never trusts a client supplied tenant ID.
- School setup UI uses the existing ClassLoom shell and shadcn components, following the live PreSkool page structure. It displays active session, setup lists and creation forms, validation feedback, and activation confirmation.

## API

`GET /api/v1/academics/schools/:schoolId/setup` returns school and academic setup. `POST /api/v1/academics/schools/:schoolId/sessions`, `/sessions/:sessionId/classes`, `/sessions/:sessionId/subjects`, `/classes/:classId/sections`, and `/sections/:sectionId/assignments` create records. `POST /api/v1/academics/schools/:schoolId/sessions/:sessionId/activate` switches the active session. Mutations require CSRF protection and `school.manage`; reads require `school.read`.

## Verification

Unit tests cover validation and activation rules. PostgreSQL integration tests prove tenant isolation, cross-school reference rejection, uniqueness, and activation behavior. API tests cover authentication, permission and malformed input. Workspace lint, typecheck, tests, E2E, build, and migration checks run before completion.
