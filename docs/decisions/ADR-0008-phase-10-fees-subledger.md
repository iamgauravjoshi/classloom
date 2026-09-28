# ADR-0008: Immutable school receivables subledger

Date: 2026-09-28
Status: Accepted

## Context

Fees and offline payments need accurate outstanding balances, receipts, and an auditable correction path. A mutable balance or editable payment row could lose the reason for a change. A general accounting ledger adds complexity beyond school receivables.

## Decision

Store exact minor-unit amounts and append-only charge, concession, payment, and payment-reversal entries scoped to one school and student school enrollment. Derive outstanding from those entries. Record payments with immutable receipts and allocations; reverse by compensating entries. Lock account and receipt-counter rows for financial writes. Use a unique idempotency key for payment retries. Keep gateway settlement and refunds outside this phase.

## Consequences

The history remains explainable and can support gateway reconciliation later. Reads aggregate entries, and corrections require explicit operations instead of row edits. This is a receivables ledger, not a general ledger or a substitute for bank reconciliation.
