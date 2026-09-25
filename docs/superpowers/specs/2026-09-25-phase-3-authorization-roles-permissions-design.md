# Phase 3: Authorization roles and permissions

## Goal

Give each authenticated tenant member only the school operations allowed by their assigned roles and resource scopes. Enforce authorization at the API boundary, independently of the web UI, while preserving PostgreSQL tenant isolation as a separate boundary.

Phase 2 establishes accounts, memberships, and server-side sessions. An authenticated session alone must not grant access to future school data or administrative operations.

## Scope

Phase 3 establishes the authorization catalog, tenant-managed roles, scoped membership assignments, API enforcement primitives, a trusted first-administrator bootstrap path, administrative APIs for role assignment, and audit records for authorization changes.

The initial built-in role templates are:

- **Tenant administrator** — tenant-wide administration and access management.
- **School administrator** — administration within an assigned school.
- **Principal** — school-wide academic oversight.
- **Teacher** — teaching operations within assigned campus or academic scope.
- **Attendance operator** — attendance operations within assigned school or campus.
- **Finance operator** — fee and payment operations within assigned school or campus.
- **Auditor** — read-only access within assigned scope.

Templates are seeded per tenant. Tenant administrators can create custom roles by selecting from the system permission catalog, but cannot create permission keys or grant permissions outside that catalog. Built-in role templates are immutable; tenants may copy one to create a custom role. There is no platform-support role in this phase.

Scope hierarchy for this phase is tenant, school, and campus. Tenant scope includes all descendants; school scope includes its campuses; campus scope is limited to that campus. Academic and relationship scope types are part of the authorization contract, but assignments of those types are denied until the corresponding academic and person-relationship modules provide authoritative resource resolvers. Authorization fails closed when a scope cannot be resolved.

Phase 3 does not implement school operations such as attendance, fees, exams, marks, or student and guardian portals. It defines permission keys for the first operational areas and enforcement primitives that those future modules must use.

## Permission model

Permissions use stable `resource.action` keys, for example `authorization.roles.read`, `authorization.roles.manage`, `memberships.read`, `memberships.invite`, `attendance.read`, `attendance.record`, `marks.read`, `marks.enter`, `results.publish`, `finance.read`, `payments.record`, `payments.adjust`, and `reports.export`.

The permission catalog is application-owned and versioned in migrations or seed data. Tenant data may reference catalog entries but may not add or mutate permission definitions. The catalog records a permission's resource family and required scope type. Sensitive state transitions remain separate workflow policies: having `marks.enter` does not allow editing marks after the configured editing window closes, and having `results.publish` does not bypass result validation.

Authorization uses default deny. API routes declare required permission keys and, when a route targets a resource, the resource identity needed to resolve its tenant and scope. The API resolves the authenticated account's active membership from the server-side session. Tenant ID, role, and scope never come from a client-controlled header or request body. UI visibility is convenience only; protected APIs always authorize independently.

Where an operation requires several permissions, all declared requirements must pass. Assignments from multiple roles combine as a union within the same active membership. A broader tenant assignment covers descendants; assignments never cross tenant boundaries. Missing membership, suspended membership, unknown permission, unresolved resource, or unsupported scope denies access.

## Data model and tenant isolation

Add tenant-owned role definitions, role-to-permission mappings, and membership role assignments. Assignments reference a membership and role from the same tenant using tenant-safe composite foreign keys. The assignment scope records tenant, school, or campus; tenant scope has no narrower identifier, school scope references a school in that tenant, and campus scope references a campus and its school in that tenant. Constraints reject incomplete or contradictory scope combinations.

Role, mapping, and assignment tables use forced RLS and require `withTenantContext`. The system permission catalog is read-only to the runtime role. The API runtime role receives only the grants required by tenant-scoped repository functions. Role mutations validate both tenant membership and assignment scope inside one transaction; no tenant control-plane table access is added to the application runtime.

The initial role catalog is created for existing tenants by a migration or idempotent seed operation. New tenant provisioning creates the same templates atomically with the tenant and school, or invokes a required post-provision step that cannot leave a provisioned tenant without its authorization templates.

## API and bootstrap flows

Add an authorization module with:

- permission metadata and a Nest guard for authenticated protected routes;
- a policy service that resolves membership roles, scopes, and permissions;
- tenant-scoped repositories for listing roles and assignments, creating custom roles, and assigning or revoking roles;
- authenticated administrative endpoints protected by `authorization.roles.read` or `authorization.roles.manage`;
- request schemas that reject tenant IDs and scope identities which do not belong to the active tenant;
- a trusted CLI operation for granting the first tenant administrator, since no tenant administrator exists yet to call the management API.

Invitation acceptance continues to create identity and membership only. Role assignment is a separate explicit authorized operation, preventing a generic invitation from silently granting administrative capability. The trusted bootstrap command is the only bypass to the role-management API and must record an audit event.

The phase does not require a full permission-management UI. The APIs and CLI are sufficient to administer roles and prove the server-side boundary; a web interface can consume these APIs in a later UI task without changing authorization semantics.

## Audit

Record role creation, permission changes to custom roles, role assignment, role revocation, and trusted bootstrap using append-only security audit events. Include actor account, tenant, subject membership or role ID, request ID when present, and a minimal before/after summary. Do not store credentials, session tokens, invitation tokens, or other secrets in audit metadata. Audit write and authorization mutation succeed or fail atomically. Custom-role edit endpoints are deferred from Phase 3; creation records the initial permission set, and permission-change events are required when editing is introduced.

Attendance corrections, mark changes, result publication, payment adjustments, exports, and other business audit events are emitted by the future domain modules when those operations exist.

## Security and correctness requirements

- Tenant RLS remains mandatory and does not substitute for authorization.
- The active tenant is derived only from the authenticated active membership.
- Users cannot grant a permission they do not hold through an eligible tenant-admin permission; custom roles cannot exceed the assigning administrator's grant ceiling.
- The API rejects assignment to suspended or foreign-tenant memberships and role/scope combinations outside the tenant.
- Concurrent role changes cannot remove the final active tenant administrator or leave an invalid assignment.
- Unknown permission keys, missing resource context, and unsupported academic/relationship resolvers fail closed.
- Permission checks do not rely on cached results across a role change; if caching is added later, role changes must invalidate it before taking effect.

## Testing requirements

Test permission lookup and default-deny rules, multiple-role union, tenant/school/campus inheritance, assignment revocation, permission ceiling, suspended memberships, foreign-tenant IDs, invalid scope combinations, and concurrent final-administrator protection.

PostgreSQL integration tests must verify RLS on every new tenant table, cross-tenant assignment rejection, absent tenant context, composite foreign-key enforcement, audit atomicity, and pooled connection reuse. API end-to-end tests must prove authenticated users without a permission receive forbidden responses, permitted administrators can manage assignments only in their tenant, and a client-supplied tenant cannot change authorization context.

Every future protected route must declare its permission and resource scope and include authorization tests. Every future tenant-owned table must retain the Phase 1 tenant ID, composite relationship, RLS policy, and isolation tests.

## Decisions and trade-offs

- Application-owned permission keys keep spellings stable and avoid tenant-defined access capabilities.
- Tenant-owned custom roles allow school organizations to adapt role combinations while the catalog caps their authority.
- Membership assignments keep roles tenant-specific even when one global account belongs to several tenants.
- Tenant, school, and campus scopes are enforceable against current schema. Academic and relationship assignments remain denied until owning modules can prove resource relationships.
- Trusted bootstrap is necessary because the first administrator cannot be authorized by an administrator role that does not yet exist.
- The phase provides API and CLI administration first; a web role editor is deferred to keep authorization correctness independent of UI implementation.
