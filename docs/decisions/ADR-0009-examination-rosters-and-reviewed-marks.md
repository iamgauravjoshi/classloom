# ADR-0009: Examination roster snapshots and reviewed marks

Date: 2026-10-05

Status: Accepted

Examinations snapshots academic enrollments at exam opening using the date-scoped Enrollment contract. It stores scores in integer hundredths, serializes writes on the assessment, and requires versions to prevent overwriting another editor. Submitted sheets are reviewed and locked; locked marks require a reasoned correction approved by another account. Audit events are append-only and commit with every domain mutation.

These choices preserve marks after student transfers, prevent partial or stale sheet updates, and make corrections attributable. The existing reserved `marks.read`/`marks.enter` permission keys become school-scoped, with section/subject restrictions enforced in Examinations for linked teachers. A separate `marks.approve` permission avoids granting ordinary teachers review authority. Phase 12 will consume locked marks through an application contract rather than directly reading examination tables.
