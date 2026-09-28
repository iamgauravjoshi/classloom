# Phase 10: Fees and offline payments

## Decision and scope

Build the first school-scoped receivables ledger. Staff configure fee heads and session/class fee plans, assign a plan to a student's school enrollment, issue charges, grant a documented concession, record an offline payment, and inspect a student statement and outstanding report. Payment gateway integration and automatic invoicing are deferred until these balances are trustworthy. This phase follows Attendance in the current delivery sequence, despite the older master prompt's different numbering.

## Financial model

All amounts are positive integer minor units in the school's configured currency. Currency and fee-head/plan/term descriptions are copied onto issued charges. A plan is editable only before it has issued charges; later changes require a new plan. A charge is issued at most once for each assignment and plan line. A student assignment is linked to an existing school enrollment and academic session, and the Enrollment and Academics modules validate that relationship through narrow application contracts. Assignment immediately issues all plan lines as charges.

An immutable ledger contains charge debits, concession credits, payment credits, and compensating payment reversal debits. Each entry identifies the school, student school enrollment, source, actor, reason when applicable, and time. The outstanding amount is the sum of debits minus credits; it is never stored as an editable balance. Concessions cannot exceed the unpaid charge. Payments cannot exceed outstanding, and are allocated to charge entries. A reversed payment retains its receipt and allocations and appends compensating debits. Corrections require a reason and `payments.adjust` permission. No refund disbursement or wallet/advance balance is created in Phase 10.

Receipt numbers are sequential within a school and generated while locking a school-scoped counter row. The client supplies an idempotency key for payment recording; a replay returns the original receipt. A payment is atomic with allocations, ledger credits, and an audit event. The receipt displays its school, currency, payer reference, method, allocation details, date, and reversal status.

## Access and tenancy

`finance.read` reads fees, statements, and reports. New `finance.manage` configures plans, assigns students, and issues charges. `payments.record` records offline payments. `payments.adjust` grants concessions and reverses payments. The API checks each permission in the authenticated membership's school scope. Every finance table has tenant and school keys, composite foreign keys where applicable, forced RLS, and runtime grants. There is no client-supplied tenant identity.

## Interface and errors

The Fees area has a school/session selector, plan setup, accounts and outstanding views, a student statement, and payment/receipt actions. It follows the existing ClassLoom shadcn Base UI components and responsive patterns. Server validation reports field-specific problems. The client shows useful inline errors and toasts, loading states, and successful receipt confirmation. Empty schools show setup guidance without fake financial records.

## Verification

Verify money arithmetic, idempotent payment replay, concurrency boundaries, school isolation, authorization, and immutable correction behavior with unit and database-backed tests. Run migration checks, typecheck, lint, relevant tests, and build; report any unavailable checks honestly.
