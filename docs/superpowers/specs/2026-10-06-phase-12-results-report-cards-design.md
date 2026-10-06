# Phase 12 - Results and report cards

## Scope and users

Staff configure school grading policies, calculate reports from completed examinations, add remarks, submit for review, obtain approval from another account, and publish. Linked students and guardians read and download their own currently published report cards. Guardians additionally require an active profile and the current relationship's `portalAccess` flag. No public report URLs or automatic messages are introduced.

The user approved school-configurable percentage grade bands and pass thresholds with staff review. This implementation uses the existing ClassLoom design system and installed shadcn Base UI components. Execution is native on `phase-12-results-report-cards`, after merging the completed UI commit into main.

## Calculation and snapshots

Results is a separate module. Examinations supplies a consistent, versioned source through an application contract: completed exam, locked assessment sheets, marks, and pending-correction state. Enrollment resolves historical enrollment identities; People supplies identity and current portal relationships; Academics supplies labels. Results does not query their tables directly.

Grade policies are immutable revisions: named bands with distinct minimum percentages covering zero, an overall passing percentage, and an optional requirement to pass every subject. Scores retain integer hundredths. Percentages are truncated to two decimal places, with integer arithmetic for thresholds. No grading policy is silently invented or applied before staff saves it.

Scored zero remains zero. Absent assessments count as zero against their maximum and fail their subject. Exempt assessments contribute neither earned nor maximum/passing marks. Multiple assessments for a subject aggregate their earned, maximum, and passing marks. A subject passes when its included scored total reaches its passing total and it has no absence. All-exempt reports have no percentage or grade. Different date-effective rosters can leave an assessment not applicable to a student; this is shown as `not_assessed`, and the report is incomplete with no overall grade or pass award. Incomplete reports require a staff remark before submission and remain explicitly incomplete after publication.

One report represents a student in one exam section. A transfer can therefore produce separate section reports. Each report freezes names, academic labels, grading policy, assessments, totals, and outcomes. Later identity edits or mark corrections never rewrite an issued report.

## Review and publication

Batch lifecycle: draft -> submitted -> approved -> published. Reviewers can return submitted/approved batches to draft with a reason. Only drafts permit remarks or recalculation. Approval requires an account different from both the latest preparer and submitter. All writes require expected batch versions; generation uses an idempotency key.

Calculation, submission, approval, and publication require completed/locked current marks with no pending corrections. A source fingerprint detects reviewed-mark changes. Stale work must return to draft and recalculate before approval/publication. Recalculation preserves remarks. Previously published snapshots remain the official issued edition until a staff publisher replaces or withdraws them.

Publishing supersedes the previous published batch atomically, with only one current edition per examination. An older edition cannot replace a newer issued edition. Withdrawal requires a reason and removes family access immediately. Superseded and withdrawn editions remain visible to authorized staff as history. PDF previews clearly label unpublished states; families never access those states.

## Authorization, persistence, and exports

Activate `results.publish` at school scope; add school-scoped `results.read`, `results.manage`, `results.approve`, and `results.export`. Administrators/principals receive these; auditors receive read only. Existing teachers do not automatically gain broader marks visibility. Custom roles can be granted appropriate school access. Student/guardian access derives from current server-resolved People links, not a supplied student or tenant ID.

New policies, batches, reports, and events have tenant/school keys, forced RLS, scoped foreign keys, and runtime grants. Policies and events are append-only. A database trigger prevents report updates outside draft batches. Parent examination locks serialize source changes and result publication; batch locks and versions prevent concurrent edits. Domain mutations and events commit together. Family access and PDF export are rechecked on every request; export events are audited. PDFs and responses use `private, no-store` and have no shared download cache.

## Interface and verification

`/results`: school/exam context, batch editions and source currency, results table, review/publication actions, and a grading-policy tab. `/report-cards`: personal published report list. `/report-cards/[reportId]`: responsive report detail, authorized draft remarks, publication identity, assessment detail, and PDF download. Navigation follows available capabilities and current personal links. Loading, permission-empty, empty, stale, error/retry, pending, and successful-write/failed-refresh states use shared product primitives.

Verify exact arithmetic, grade boundaries, absence/exemption/incomplete outcomes, policy revisions, lifecycle/separation, stale corrections, publication replacement, immediate relationship revocation, PDF access, RLS/FKs, rollback, concurrency, and idempotency. Run DB/API integration and frontend tests plus typecheck, lint, and builds. Review authenticated staff and personal screens at desktop/phone widths; render representative and long report PDFs to inspect pagination and glyphs.
