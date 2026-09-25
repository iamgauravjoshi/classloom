# Multi-tenancy

The shared PostgreSQL database will carry a non-null `tenant_id` on every school-owned table. Campus and academic-session scopes refine it. A request will resolve the authenticated tenant membership, authorize the action and resource, then access data through tenant-aware repositories. PostgreSQL row-level security will provide an independent database boundary for tenant-owned tables, using a transaction-local tenant setting.

Phase 0 has no tenant-owned records. Phase 1 creates the first tenant schema, implements RLS policies and tenant context, and adds integration tests proving Tenant A cannot read or mutate Tenant B data, including by direct identifier access. Cross-tenant exports and background jobs use the same explicit context model.
