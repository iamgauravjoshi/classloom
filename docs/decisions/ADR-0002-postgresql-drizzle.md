# ADR-0002: PostgreSQL and Drizzle

**Status:** Accepted

**Context:** Tenant isolation needs relational constraints, transactions, and reviewable RLS policies.

**Decision:** Use PostgreSQL with Drizzle schema definitions and versioned SQL migrations.

**Alternatives:** Prisma has strong tooling, but direct SQL migrations give this project a clearer review path for RLS and database policy changes.

**Consequences:** The team owns explicit migration review and tests migration behavior against a real PostgreSQL instance.
