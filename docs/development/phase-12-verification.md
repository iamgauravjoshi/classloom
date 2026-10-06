# Phase 12 verification

Date: 2026-10-06. Branch: `phase-12-results-report-cards`.

## Automated checks run

| Check | Evidence |
| --- | --- |
| Database build/typecheck | Passed |
| Database tests with `.env` loaded | 38 files, 159 tests passed |
| API typecheck/build | Passed; both embedded font assets exist under `dist/results/fonts` |
| API lint | Passed with one existing Finance test sort-comparator warning; no Results warnings |
| API unit tests | 25 files, 108 tests passed |
| API end-to-end tests with `.env` loaded | 13 files, 43 tests passed |
| Final focused Results API tests | 1 file, 5 tests passed after source ordering/privacy changes |
| Web lint/typecheck/production build | Passed |
| Full frontend tests | 43 files, 113 tests passed |
| Final focused Results frontend tests | 5 files, 11 tests passed after pending-context and error-copy fixes |
| Additive migrations `0018`–`0020` | Generated, inspected, applied successfully to the recovered local database |

Database-backed commands used the native dotenv CLI to preserve arguments: `node node_modules/dotenv-cli/cli.js -e .env -- pnpm --filter <package> <command>`. Ordinary package checks used pnpm directly.

The isolated API fixture exercises strict inputs, permission and CSRF denial, idempotent policy revisions and result generation, exact grade boundaries, stale writes, separate approval accounts, correction-driven invalidation, return/recalculation preserving remarks, concurrent recalculations, atomic supersession and withdrawal, private family responses, guardian portal/status revocation, student unlink revocation, audited PDF downloads, forced RLS, mismatched tenant/school references, immutable policies/events/reviewed reports, pooled context reset, and rollback when the audit actor reference fails. Fixtures clean up only their own synthetic tenant and accounts.

Calculation tests cover valid zero, exact percentage thresholds, fractional truncation, absent, exempt, multiple papers, missing roster coverage, invalid marks, and separate reports across sections. Frontend tests cover explicit incomplete outcomes, draft preservation on failed saves, publication blocked by stale marks, separate approval, personal read-only reports, contextual access recovery, duplicate save prevention, paused writes after refresh failure, percentage messages, and private binary proxy responses/allowlists/body limits.

## Browser and PDF review

Authenticated ClassLoom preview reviewed at desktop 1440×1000 and narrow 320×900. Results navigation, school/examination selectors, no-edition state, grading policy form, labels, mobile field stacking, button sizes, and the out-of-range percentage error were checked. The 320px page had no document horizontal overflow. The browser validation test used an invalid 101% input and did not save a policy. The existing demo school’s real grading policy was not guessed or published.

The browser preview has no existing Phase 12 policy/report edition. Populated result review and family publication/revocation were therefore verified through isolated authenticated API fixtures and frontend rendering tests, rather than publishing a report for the current demo school. This distinguishes those checks from the browser visual review.

PDFKit output was rendered with PDFium and inspected: normal published report is one A4 page; an 18-subject long-label/long-remarks draft spans three pages with correct footers; a Devanagari student name renders correctly; an unsupported Chinese glyph is preserved as `[U+738B]` with an explanatory note. The review caught and fixed an extra blank page caused by the footer exceeding the text margin. The HTML report retains all original Unicode text; embedded PDF font coverage remains limited as documented in the Results guide.

Private review artifacts are ignored under `.local/reviews/phase12/`. The primary source design rules and existing Base UI components were followed. Shadcn MCP tools used: `get_project_registries` and `view_items_in_registries`; installed Card, Table, Dialog, Tabs, Checkbox, fields, and shared product primitives were reused.
