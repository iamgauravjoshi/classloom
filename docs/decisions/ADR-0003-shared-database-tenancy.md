# ADR-0003: Shared database with tenant isolation

**Status:** Accepted for Phase 1 implementation

**Context:** Schools need strict isolation without a database per small tenant.

**Decision:** Use shared PostgreSQL tables with required `tenant_id`, tenant-aware API access, and RLS on school-owned tables. Keep control-plane access separate.

**Alternatives:** Database-per-tenant improves physical isolation but increases provisioning and migration operations; application filtering alone is too easy to omit.

**Consequences:** Every tenant table and query requires isolation review and cross-tenant tests. Phase 0 documents the pattern; Phase 1 implements it with the first tenant records.
