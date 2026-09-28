# Phase 10 implementation plan

1. Add fee and ledger schema with scoped foreign keys, constraints, RLS, and migration. Add `finance.manage` authorization and reseeding behavior.
2. Implement exact-money rules and finance persistence: setup, assignment and issuing, statement/reporting, concessions, idempotent offline payments, receipt numbers, and reversals. Add focused tests.
3. Add Enrollment and Academics validation contracts, then a guarded Finance API with Zod request parsing and actionable error mapping. Test permissions and school isolation.
4. Build the responsive Fees UI with installed shadcn Base UI components, proxy route, permissions, and error/success feedback. Verify desktop and narrow views.
5. Update product and architecture docs. Run migration check, tests, lint, typecheck, and build. Review the whole branch before finalizing.
