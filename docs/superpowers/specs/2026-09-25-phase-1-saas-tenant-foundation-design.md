# Phase 1: SaaS and tenant foundation

## Goal

Establish the database and service boundaries needed to operate multiple schools in one ClassLoom deployment. Phase 1 introduces tenants, schools, campuses, tenant-scoped database access, and verified PostgreSQL isolation. Authentication and end-user school switching remain Phase 2 work.

## Scope

Phase 1 includes:

- Tenant, school, and campus data models with tenant-aware constraints.
- A transaction-local tenant context helper used by tenant-owned repositories.
- PostgreSQL row-level security (RLS) for school and campus records.
- A trusted service-only tenant provisioning path that can create a tenant and its initial school.
- PostgreSQL integration tests exercising tenant isolation with a non-superuser runtime role.
- Documentation for schema ownership, provisioning, tenant context, and future tenant-owned tables.

Phase 1 excludes login, user accounts, memberships, sessions, role/permission authorization, public tenant-selection endpoints, and school-switching UI. No unauthenticated request may choose a tenant by sending an ID or slug.

## Data model

All entity primary keys use UUIDs. `tenants` is the control-plane root. A tenant can own multiple schools; each school can own multiple campuses. Schools and campuses have a required `tenant_id`.

- `tenants`: display name, unique stable slug, lifecycle status, created/updated timestamps.
- `schools`: tenant ID, name, tenant-unique code, timezone, currency, created/updated timestamps.
- `campuses`: tenant ID, school ID, name, school-unique code, optional address fields, created/updated timestamps.

Composite unique keys on `(tenant_id, id)` and composite foreign keys from campuses to schools ensure a campus cannot reference a school in another tenant. Codes are unique within their documented parent scope. Tenant ID is immutable on tenant-owned records; moving data between tenants is not an update operation in Phase 1.

Tenant-owned schemas added later must include a non-null `tenant_id`, use tenant-scoped repositories, and add an RLS policy unless an ADR records a justified exception. Foreign keys between tenant-owned tables must include tenant ID in the reference.

## Tenant context and data access

The database package will expose a helper that accepts a tenant UUID and a callback. It opens a database transaction, sets `app.tenant_id` with PostgreSQL `set_config(..., true)`, then invokes the callback with the transaction-scoped Drizzle handle. The setting is transaction-local so pooled connections cannot retain the previous request's tenant. Tenant UUIDs are validated before the transaction begins.

RLS is enabled and forced for schools and campuses. Policies use the transaction-local setting for both `USING` and `WITH CHECK`: reads and writes are visible only when the row's `tenant_id` equals the active context. Missing context resolves to no visible rows and rejected writes. The database runtime role must not be a superuser or have `BYPASSRLS`; migrations use a separate privileged role. RLS is defense in depth and does not replace API authorization when that arrives in Phase 3.

Tenant context is explicit for HTTP requests, jobs, exports, and scripts. Phase 1 provides the database primitive and service boundaries; it does not infer tenant context from an untrusted request. Phase 2 authentication will resolve an account's tenant membership and pass the authorized tenant ID to this helper.

## Provisioning boundary

A service-only provisioning operation creates a tenant and its initial school atomically. It uses a control-plane database capability separate from ordinary tenant-scoped reads and writes. Phase 1 does not expose this operation as a public or unauthenticated HTTP endpoint. Future platform-admin APIs must authenticate and authorize the operator before invoking it.

Failure to create either record rolls back the full operation. Duplicate tenant slugs or tenant-scoped school codes produce a conflict at the service boundary; database constraints remain authoritative under concurrent requests.

## Database roles and migrations

The application runtime connects as a non-superuser, non-owner role without `BYPASSRLS`. Schema migrations run with a distinct owner-capable credential. The service-only provisioning capability is separated from tenant-scoped runtime access and is not exposed to browser clients. Local development configuration and CI integration tests must exercise the runtime role rather than relying on a superuser connection, because PostgreSQL superusers bypass RLS even when policies are forced.

## Verification

PostgreSQL integration tests use two tenants and a non-superuser role. They prove:

1. Tenant A can read and write its own schools and campuses.
2. Tenant A cannot read, update, or delete Tenant B records, including lookups by known record UUID.
3. Inserts or updates with a mismatched tenant ID are rejected.
4. Reads return no tenant-owned rows and writes are rejected when tenant context is absent.
5. Tenant context does not leak between sequential transactions that reuse a pooled connection.
6. A campus cannot reference a school from a different tenant, even through a privileged write path.
7. Tenant and initial-school provisioning is atomic and obeys uniqueness constraints.

The database package and API checks, workspace lint/typecheck/build, and the focused integration suite are run before completion. Tests requiring PostgreSQL use the repository's configured local or CI PostgreSQL service.

## Alternatives considered

1. **Accept a tenant ID from a request header.** This is simple to wire before authentication, but lets an unauthenticated caller choose any tenant. Rejected.
2. **Add authentication and membership resolution as part of Phase 1.** This would permit immediate browser flows but overlaps the separately scoped Phase 2 identity and session work. Rejected.
3. **Add tenant-scoped database primitives and a non-public provisioning service now.** This creates the tenant boundary and supports trusted bootstrap work without treating client input as identity. Selected.

## Acceptance criteria

- Tenant, school, and campus schemas and migrations enforce the stated ownership constraints.
- Runtime queries to schools and campuses require transaction-local tenant context and are constrained by forced RLS.
- Runtime database credentials cannot bypass RLS.
- Provisioning creates a tenant and initial school atomically and has no unauthenticated public route.
- The integration tests listed above pass using PostgreSQL and a non-superuser runtime role.
- Architecture and development documentation explain the tenant boundary and future module requirements.
