# API Development Instructions

## Architecture and Module Ownership

This is a NestJS modular monolith. Current modules include `auth`, `authorization`, `academics`, `database`, `health`, and shared `common` and `config` code. Follow established module patterns and the phase order in `docs/architecture/module-boundaries.md`. A domain module owns its controllers, application behavior, authorization checks, persistence integration, and tests. Interact with another domain through an explicit service or contract; do not use its tables as an API. Avoid circular module dependencies and speculative framework layers.

## HTTP and Validation

The versioned REST API is rooted at `/api/v1`; `main.ts` configures global routing and OpenAPI. Validate external input with the established Zod/request-validation patterns, return the existing error envelope, and preserve request IDs. Do not expose database models as public contracts or leak internal errors, credentials, tokens, or sensitive student, staff, or financial data in responses and logs.

## Authentication, Authorization, and Tenant Context

Protected operations enforce authorization in the API. Use the existing `AuthGuard`, `AuthorizationGuard`, `@RequirePermissions(...)`, and server-side target-scope resolution patterns. Missing permissions or unresolved/unsupported resource scopes must fail closed. Mutating browser requests must retain the exact-origin check and `X-ClassLoom-Request: 1` CSRF marker. Tenant identity comes from the authenticated active membership; never trust a request's tenant ID or role as authority. Follow `docs/architecture/identity-and-access.md` and `docs/architecture/multi-tenancy.md` before changing these flows.

Accounts are created through the trusted invitation flow. Do not add public account creation or invitation creation endpoints without an approved product and architecture change. Trusted local CLI commands are `pnpm --filter @classloom/api auth:invite -- <tenant-id> <email>` and `pnpm --filter @classloom/api auth:bootstrap-admin -- <tenant-id> <email>`; keep them server-side and use the restricted runtime connection as documented.

## Database Access

Use the shared `DatabaseService` and database package functions. Tenant-owned reads and writes must run inside `withTenantContext` (or an explicitly documented equivalent) so transaction-local PostgreSQL context and forced RLS apply. Keep transactions around operations whose audit record and domain mutation must commit together. Do not connect using migration or provisioner credentials from API runtime code.

## Tests and Commands

Keep unit tests beside source as `*.spec.ts`. API end-to-end tests use `*.e2e-spec.ts`; shared foundation coverage is under `test/`, while feature tests may be under `src/`. Use Vitest and the existing `vitest.config*.ts` configurations. Run `pnpm --filter @classloom/api test`, `pnpm --filter @classloom/api test:e2e`, `pnpm --filter @classloom/api lint`, and `pnpm --filter @classloom/api typecheck` as relevant. PostgreSQL-backed tests require the local URLs from `.env`; load them with `pnpm exec dotenv -e .env -- pnpm --filter @classloom/api test` when needed. API implementation and environment variables are described in `docs/development` and `.env.example`.
