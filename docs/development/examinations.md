# Examinations and reviewed marks

Phase 11 requires migration `0017_jazzy_puff_adder.sql`. Run `pnpm db:migrate` using `DATABASE_MIGRATION_URL`, then `pnpm dev`. Sign in and open `/examinations`.

## Workflow

1. Choose a school and create an examination for a session and class. Its dates must be within the academic session.
2. Add assessments for sections in that class and subjects in the session. Set the assessment date within the exam dates, maximum marks greater than zero, and passing marks no greater than the maximum. Limits support two decimal places up to 1,000.00.
3. Open the exam. Enrollment supplies each assessment's enrolled roster as of its scheduled date. An empty roster blocks opening; the transaction leaves every assessment unchanged. Configuration is fixed after opening, and later transfers do not rewrite these snapshots.
4. On or after the scheduled assessment date in the school timezone, record each student as scored, absent, or exempt. Zero is a valid score. Save the complete roster; unmarked entries can remain in a draft. Validation failures preserve browser edits.
5. Save all outcomes, then submit the sheet for review. A reviewer may return it with a reason or lock it. Complete the exam after every sheet is locked and pending corrections have been reviewed.
6. To change locked marks, request a correction with a reason. Another account with review permission must approve or reject it with a reason. A pending correction does not change the recorded mark. Approval updates the mark and audit history in one transaction; rejection preserves the mark. Completed exams retain this correction workflow.

School, exam, and assessment selectors pause while edits are unsaved. Use **Save marks** or **Discard unsaved changes** before switching. A stale save returns a conflict: discard the stale browser draft, refresh, and reapply the intended changes. After a successful write, a failed refresh pauses further actions until **Refresh** succeeds, avoiding accidental repeated submissions.

## Permissions and ownership

`exams.manage` controls configuration and lifecycle; `marks.read` reads sheets; `marks.enter` saves, submits, and requests corrections; `marks.approve` returns, locks, and reviews corrections. These permissions are school scoped. Administrators and principals receive management and review permissions; ordinary teachers receive read and entry. An eligible linked teacher without management/review access is restricted to the exact session, section, and subject assignments supplied by Academics. Unlinked ordinary teachers cannot access sheets. School readers such as auditors can view but cannot write.

Tenant context comes from the active authenticated membership. Examinations uses forced RLS and scoped foreign keys for all five tables. Runtime roles cannot delete examination records or change historical events. Marks are integer hundredths in API/database values (`72.50` is `7250`). Client conversion does not round overprecise input. Versions and parent-then-assessment locks protect against competing saves.

## API

All paths below start with `/api/v1/examinations`. Writes require the normal server session and CSRF origin/application headers.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/schools` | Accessible schools and capabilities |
| GET | `/schools/:schoolId/setup` | Academic options and visible examinations/assessments |
| POST | `/schools/:schoolId/exams` | Create draft exam |
| POST | `/schools/:schoolId/exams/:examId/assessments` | Add draft assessment |
| POST | `/schools/:schoolId/exams/:examId/lifecycle` | Open or complete with expected version |
| GET | `/schools/:schoolId/assessments/:assessmentId/sheet` | Snapshot marks, correction requests, and history |
| PUT | `/schools/:schoolId/assessments/:assessmentId/marks` | Versioned complete-roster save |
| POST | `/schools/:schoolId/assessments/:assessmentId/review` | Submit, return, or lock |
| POST | `/schools/:schoolId/assessments/:assessmentId/corrections` | Propose a reasoned locked-mark change |
| POST | `/schools/:schoolId/assessments/:assessmentId/decisions` | Approve/reject a pending correction |

Result calculation, grading, publication, and PDF report cards belong to Phase 12. Phase 11 does not expose marks to student or guardian portals.

## Verification

```powershell
pnpm exec dotenv -e .env -- pnpm test
pnpm exec dotenv -e .env -- pnpm test:e2e
pnpm typecheck
pnpm lint
pnpm build
```

Focused checks can append `examinations` to `pnpm test` or `pnpm test:e2e`. Tests create isolated synthetic fixtures and remove only their own data through the trusted test connection.
