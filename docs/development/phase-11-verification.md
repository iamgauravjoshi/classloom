# Phase 11 verification record

Review date: 2026-10-05. Final verification: 2026-10-06. Branch: `phase-11-examinations`.

## Automated checks

- Database: 38 files / 159 tests passed, with `.env` loaded and the restricted runtime role. This includes all examination workflow and RLS tests.
- Web: 33 files / 90 tests passed using `pnpm exec vitest run --maxWorkers=1 --testTimeout=15000` in `apps/web`.
- API unit tests: 24 files / 102 tests passed using `pnpm --filter @classloom/api test`.
- Authenticated API E2E: 12 files / 38 tests passed using the root `pnpm test:e2e` script with `.env` loaded.
- Final focused examination checks: 19 unit/integration/browser tests passed after the dialog and isolation fixes. The two additional authenticated examination E2E tests also passed.
- `pnpm build` passed for database, API, and web, including the protected examination route and proxy.
- `pnpm lint` passed, retaining one existing Finance E2E warning about an array sort comparator.
- `pnpm typecheck` passed after explicitly typing the examination E2E account fixture array.
- `pnpm db:check` passed after recovery and migration.

The first broad run overlapped both test suites and development servers. It produced frontend timeouts and a People E2E fixture-cleanup deadlock. The full web suite passed with one worker; all API E2E suites passed when rerun separately. No application behavior or global test timeout configuration was changed to hide these failures.

## Authenticated browser review

Reviewed at 1440 × 1000 and 390 × 844 using the existing administrator session and synthetic `DEMO-` students. The narrow page had no horizontal overflow; desktop marks tables became student cards. Browser error/warning logs were empty at the end of review.

The review created **DEMO — September review** for the existing demo academic session and Grade 8, with **DEMO Writing paper** in Section A. It verified calendar selection, examination creation, assessment configuration, opening a four-student roster, maximum-marks feedback, zero/72.50/absent/exempt outcomes, save, submit, return with reason, resubmit, lock, and complete. A correction request proposing 0 → 10 remains pending for a second authorized account to inspect. The recorded mark remains 0, and the requester cannot approve it. Automated E2E tests verify approval by the second account and database tests also verify rejection.

Fixed during review: selecting a portalled calendar date dismissed the containing form; form dialogs now use Base UI pointer-dismissal protection. Dialog content also remains stable during closing animations. Both desktop and narrow screenshots are saved privately under `.local/reviews/phase-11/` and excluded from Git.

## Data recovery

The surviving Docker volume had PostgreSQL 17 data. A read-only cold backup was saved at `.local/backups/classloom-pg17-20261005.tar.gz` before attaching it to `postgres:17-alpine`. Existing tenant, student, and receipt records were present after recovery. Migration `0017_jazzy_puff_adder.sql` was then applied; a new empty database was not provisioned.
