# Phase 12 implementation plan

Execute natively, using existing package/module patterns and the approved design spec. Preserve unrelated line-ending-only working-tree differences. Branch: `phase-12-results-report-cards`.

1. Define Results contracts and exact calculation tests: policy validation, percentage thresholds, aggregation, zero, absent, exempt, and incomplete coverage.
2. Add tenant-safe policies/batches/reports/events schema; generate/review an additive migration with forced RLS, restricted grants, immutability, and permission catalog updates.
3. Add Examinations source, historical Enrollment identity, and People portal contracts. Implement versioned/idempotent Results persistence and atomic audited review/publication. Exercise isolation, locks, rollback, and revocation with synthetic fixtures.
4. Implement protected Results APIs, explicit validation/errors, current relationship access, and audited PDF generation. Embed a licensed font, test PDF responses, and visually inspect normal/long output.
5. Build the staff result workflow, policy editor, personal report list/detail, allowlisted proxy, and role-aware navigation with installed Base UI components and shared product patterns. Preserve drafts and pause repeated writes after refresh failures.
6. Run package and database-backed checks, authenticated browser review at desktop/narrow widths, and PDF rendering. Update README, module/security docs, phase guide, and verification record with actual evidence and limitations. Commit phase implementation separately when verified; publication/merge follows the established user-requested Git workflow.
