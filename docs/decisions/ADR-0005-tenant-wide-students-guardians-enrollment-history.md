# ADR-0005: Tenant-wide student and guardian identities with enrollment history

**Status:** Accepted for Phase 6 implementation

**Context:** A student may attend more than one school in the same tenant over time. A guardian may support siblings at more than one school. The product must keep identity consistent while restricting school directories and preserving admission and placement history.

**Decision:** Store one tenant-wide student profile and one tenant-wide guardian profile per person, identified by tenant-unique case-insensitive codes. Represent responsibilities in separate student–guardian relationships. Store school admission periods separately from academic placements; transfer, withdrawal, and completion close current records while retaining history. A returning student receives a new school admission period. Manual admission and CSV import coordinate People, Academics, and Enrollment contracts in one tenant transaction. Optional account links attach existing active tenant memberships without creating credentials.

**Alternatives:** School-owned duplicate profiles would diverge as students move or guardians support siblings. Updating one mutable class/section field would erase transfer and withdrawal history. Creating people and enrollment through unrelated browser requests could leave inaccessible partial profiles after a failed placement.

**Consequences:** School-scoped reads require an enrollment or relationship visibility check, and a guardian's linked-student list is filtered to the requested school. Shared identity changes require management rights at every active school; school enrollment changes require permission at the target school. Profile row locks serialize shared edits with changes to admission and guardian relationships before active-school scope is read. This adds brief contention when the same person changes concurrently. Tenant-safe composite references, forced RLS, runtime grants, and transaction-local tenant context protect records. CSV batches store checksums and counts but no uploaded personal data; retries use a tenant-and-school-scoped idempotency key.
