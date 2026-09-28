# Fees and offline payments

Phase 10 requires migration `0016_productive_spacker_dave.sql`. Run `pnpm db:migrate` with `DATABASE_MIGRATION_URL`, then start the API and web app as described in `README.md`. The migration adds eight school-scoped Finance tables, forced RLS, restricted runtime grants, and the `finance.manage` permission for existing built-in administrator and finance-operator roles. Newly provisioned tenants receive the same role catalog from the seed.

In **Fees & Payments**, select a school. Under **Fee setup**, create a fee head, then a plan for one academic session and class. Add one or more lines with installment labels, due dates inside the session, and amounts in the school's currency. Select an active student who has a placement in that class/session and **Issue charges**. A plan cannot gain more lines after its first assignment; create another plan for changed rates.

Under **Student accounts**, select the enrollment to see its statement. Record an offline payment against an outstanding charge, or grant a concession with a reason. A receipt number is sequential within the school; retries with the same idempotency key return the existing receipt. A reversal requires `payments.adjust` and a reason. Reversal keeps the original receipt and appends debit entries. The **Outstanding** tab sums charges, concessions, payments, and reversals. Amounts sent to the API are decimal strings of minor units, and the UI converts entered currency values exactly.

Permissions are school scoped: `finance.read` opens plans/statements/reports, `finance.manage` creates and issues fees, `payments.record` records offline receipts, and `payments.adjust` grants concessions and reverses receipts. API checks remain authoritative.

Run the focused database test with `pnpm exec dotenv -e ../../.env -- pnpm test finance.integration.spec.ts` from `packages/db`, and the API flow with `pnpm exec dotenv -e ../../.env -- pnpm test:e2e finance.e2e-spec.ts` from `apps/api`.
