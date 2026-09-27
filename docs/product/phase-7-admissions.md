# Phase 7: Admissions

## Goal and users

Give school staff one school-scoped case for recording an enquiry, preparing an application, reviewing it, and admitting the accepted applicant. The initial release is staff-only; families do not sign in or submit applications.

## Workflow

Each case moves through:

```text
enquiry → draft → submitted → under review → accepted → admitted
                                      └──────→ rejected
enquiry/draft/submitted/under review ─────────→ withdrawn
submitted/under review ───────────────────────→ draft (with a recorded reason)
```

Staff can edit applicant, requested academic placement, and up to ten guardian submissions while the case is an enquiry or draft. Submission and each later status change are recorded with the actor and timestamp. Acceptance and rejection require a decision note; returning to draft and withdrawing require a reason. Rejected, withdrawn, and admitted cases are retained with their case history.

One staff member with the appropriate school permissions can review and accept or reject a case. Acceptance does not require a second staff member. Admission is a separate final action available only for an accepted case.

## Conversion

The authorized staff member chooses the admission number and date, academic session, class, section, optional roll number, and placement start date. The case's saved applicant and guardian data supplies profile values. Staff may link an existing student or guardian by supplying that People profile's ID; the API checks each link within the authenticated tenant and school transaction. New profiles require a code. The system creates or links the student and guardian relationships, opens the school admission, creates the initial academic enrollment, records those references on the case, and marks it admitted in one atomic transaction.

If validation fails—for example, the requested academic placement is invalid—the transaction creates no partial profiles or enrollments and the case remains accepted for correction and retry. Repeating a completed conversion is rejected.

## Access

All permissions are scoped to a school and enforced by the API:

| Permission | Capability |
| --- | --- |
| `admissions.read` | View cases and immutable case history |
| `admissions.manage` | Create/edit cases and run review, decision, submit, and withdrawal actions |
| `admissions.convert` | Convert an accepted case to a student admission and academic placement |

The Admission Officer built-in role receives these three permissions and does not receive broad student, guardian, or enrollment management. Principals and auditors can read cases. Tenant and school administrators retain their management templates. UI visibility does not replace the server authorization check.

## Interface and endpoints

Staff use `/admissions` for the filtered case worklist, `/admissions/new` to create an enquiry or draft, and `/admissions/[caseId]` to edit, review, inspect event history, decide, withdraw, or admit a case. The same-origin web proxy forwards only the documented Admissions API routes and preserves session and CSRF protections.

The API is rooted at `/api/v1/admissions`: it exposes an authorized school capability list, school-scoped case list/create/read/update/event routes, explicit draft/submit/review/decision/withdraw transitions, and a separate `/admit` conversion action. List filtering supports search, status, requested academic session, creation date range, and cursor pagination.

## First-release boundaries

This phase does not include a family portal, document uploads, automatic email, multi-reviewer approval, or a searchable People picker. Admissions does not own People or Enrollment records; it coordinates their public application contracts. See [ADR-0006](../decisions/ADR-0006-phase-7-admissions.md) for the architectural decision.
