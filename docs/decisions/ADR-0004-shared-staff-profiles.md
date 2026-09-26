# ADR-0004: Shared staff profiles with school affiliations

**Status:** Accepted for Phase 5 implementation

**Context:** A person may teach or work at more than one school within a tenant. Some staff need a directory record before they receive a login account. Academic assignments already reference tenant memberships.

**Decision:** Store one tenant-wide `staff_profiles` record per person and one `staff_school_affiliations` record per school. Store optional teacher details separately, and link at most one active tenant membership to a staff profile. Academics keeps its membership-based assignments and asks People whether a linked teacher is currently eligible for each new assignment. Existing assignments and account labels remain intact.

**Alternatives:** One profile per school would duplicate identity and complicate account links. Making every staff profile an account would force login provisioning for people who do not need access. Rewriting academic assignments to staff IDs would change existing history and Phase 4 contracts.

**Consequences:** Shared profile, teacher, and account-link edits require manage permission at every affiliated school. School-specific designation and status can be edited by a manager of that school. Links with academic history cannot be replaced or removed. Tenant-scoped uniqueness, composite foreign keys, and forced RLS protect cross-school and cross-tenant references.
