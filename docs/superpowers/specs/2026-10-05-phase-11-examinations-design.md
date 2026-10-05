# Phase 11 — Examinations

## Scope and workflow

Examinations owns school/session/class exams and section/subject assessments with a scheduled date, maximum marks, and passing marks. Exams move from draft to open to completed. Draft configuration is immutable after opening. Opening snapshots the enrolled roster as of each assessment date through Enrollment; subsequent transfers do not rewrite examination history.

Each assessment has a versioned marks sheet: draft → submitted → locked. Draft saves include the complete snapshot roster and may retain unmarked entries. Submission requires an explicit scored, absent, or exempt outcome for every student. Reviewers may return a submission to draft with a reason or lock it. Marks use integer hundredths (up to 1,000.00), with absent/exempt scores null. Entry starts on the scheduled assessment date in the school's timezone.

Locked marks change only through a correction request containing old/new values and a reason. An account other than the requester approves or rejects it; approval applies the new mark and audit event atomically. One pending request per mark prevents competing proposals. Optimistic sheet/exam versions reject stale browser writes; row locks serialize mutations. Completed exams permit audited corrections and retain their lifecycle state. Result calculation, grading, publication, and PDF report cards belong to Phase 12.

## Authorization and ownership

`exams.manage` controls configuration and exam lifecycle. Existing `marks.read` and `marks.enter` become school-scoped usable permissions; their formerly unsupported academic scopes were reserved placeholders. `marks.approve` controls submission review and correction decisions. Built-in administrator and principal roles receive management/review; teachers retain read/entry permissions. Linked teachers without management/review privileges see and enter only assessments matching their current eligible section and subject assignments. No guardian/student access is introduced.

Academics supplies exam reference validation/options and teacher assignment checks. Enrollment supplies the date-scoped roster. People supplies linked teacher eligibility. Examinations reads no other domain's tables through its persistence layer. All operations use the authenticated tenant, forced RLS, composite scoped foreign keys, and append-only audit events. Runtime roles cannot delete examination data or update audit events.

## Interface and verification

`/examinations` uses the existing Base UI shadcn Select, Card, Field, Input, Dialog, Calendar, Badge, Table, Empty, Skeleton, and toast components. Desktop marks tables become stacked student cards at narrow widths. Forms show relevant validation errors and successes. A same-origin allowlisted proxy forwards authenticated requests and CSRF headers.

Verification covers exact score conversion, invalid marks, incomplete submission, lifecycle transitions, stale saves, rollback, teacher assignment restrictions, correction separation, forced RLS, foreign-key isolation, browser errors, protected routes, and responsive workflow. Tests use explicit synthetic student and account fixtures. Database migration is additive.
