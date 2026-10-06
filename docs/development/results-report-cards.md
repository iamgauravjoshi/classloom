# Results and report cards (Phase 12)

## Staff workflow

1. Complete an examination in `/examinations`: all assessment sheets must be locked and pending corrections resolved.
2. Open `/results`, select the school, and use **Grading policies** to save a named policy. Enter 2–20 distinct bands including a minimum of 0%, an overall pass percentage, and whether each included subject must pass. Reusing the name creates an immutable next revision; no default school policy is assumed.
3. Select the completed examination and policy revision. **Calculate new edition** creates frozen draft reports, one per student and section. A transferred student can have separate reports in two sections.
4. Open reports, review papers, and save remarks. Incomplete roster coverage requires a remark before submission.
5. Submit for review. Another authorized account, different from the latest preparer and submitter, approves the edition. Reviewers can return it to draft with a reason.
6. Publish the approved edition. This atomically replaces the current published edition. If marks changed or any correction remains pending, return/recalculate/review first. Publication never happens automatically.
7. Withdraw the current publication with a reason if necessary. Family access ends immediately; history remains available to authorized staff. A superseded edition cannot replace a newer issued edition.

The percentage is truncated to two decimal places, while grade/pass comparisons use exact integer ratios. Marks use the existing integer hundredths contract. Absent means zero and fails; exempt papers are excluded from both total and passing denominators. A missing paper is **not assessed**, and its report stays incomplete with no overall percentage or grade. Grade labels are school-configured and do not independently determine passing.

## Permissions and family access

`results.read`, `results.manage`, `results.approve`, `results.publish`, and `results.export` are school-scoped. A workflow or export grant also permits reading its necessary staff context. Tenant/school administrators and principals receive all five; auditors receive read only. Teachers retain their existing marks permissions and receive no automatic access to school-wide result editions. Custom roles may explicitly grant Results permissions.

`/report-cards` shows current published reports for an active student profile linked to the session membership, or an active guardian linked through an active student relationship with `portalAccess` enabled. The API rechecks these links, statuses, and publication on each detail or PDF request. No role name, client student ID, URL secrecy, or public download token substitutes for authorization. Family responses exclude staff review actor IDs, request keys, source fingerprints, and audit history. Unlinking a profile, disabling portal access, withdrawal, or supersession revokes that view.

## API and persistence

Routes under `/api/v1/results` provide `access`, school `setup`, policy creation, batch generation/detail/recalculation/lifecycle, personal report listing, and report detail/remarks/PDF. Writes require the normal CSRF origin and marker. Strict request schemas reject extra fields and client tenant IDs. Every write requires the expected edition version, except idempotent policy/generation creation.

Results owns grading policies, batches, reports, and append-only events. Examinations supplies reviewed marks while locking the parent exam before Results locks its batch, matching marks/correction lock order. Enrollment resolves historical roster identities; People owns current family relationships; Academics supplies labels. All work uses the authenticated tenant transaction and forced RLS. Composite references bind each report to its school, class, section, student, enrollment, and batch. Runtime credentials cannot delete reports or update/delete policies or events. A database trigger permits report inserts/updates only under a draft parent and prevents identity changes.

Migrations `0018`–`0020` are additive: Results tables/security/permissions; stable generation request checksums; complete review/publisher actor checks. Existing recovered PostgreSQL data is retained. Use the normal runtime-role setup and migration commands in the local setup guide before running the new API.

## PDF and UI behavior

Downloads are authenticated, audited, generated in memory, use UUID-only filenames, and return `private, no-store`. PDFKit embeds licensed Noto Sans and Noto Sans Devanagari (license included with the assets). Latin and Devanagari text are supported; characters outside the selected font coverage are represented explicitly as `[U+XXXX]` instead of disappearing. The online report preserves the original Unicode text. PDF copies clearly label draft, superseded, and withdrawn editions; the accessible HTML view remains the primary screen-reader interface.

The frontend reuses the existing Base UI primitives, shared page/form/status patterns, desktop tables, and narrow-width report cards. A failed save preserves the staff draft. A successful write followed by refresh failure pauses further writes until reload succeeds. No new Radix or unrelated UI library is introduced.

See [design spec](../superpowers/specs/2026-10-06-phase-12-results-report-cards-design.md), [ADR-0010](../decisions/ADR-0010-reviewed-result-editions-and-personal-report-access.md), and [verification](phase-12-verification.md).
