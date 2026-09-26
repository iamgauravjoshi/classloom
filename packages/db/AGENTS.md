# Database Package Instructions

## Ownership and Layout

`packages/db` owns PostgreSQL schema, Drizzle access, migration history, tenant context, and trusted database utilities shared by the API. Table definitions live in `src/schema.ts`; query and domain persistence helpers are grouped in `src/`; package exports are controlled by `src/index.ts`. Drizzle writes generated SQL and snapshots to `drizzle/` as configured in `drizzle.config.ts`. Keep domain rules and HTTP behavior in `apps/api` rather than moving them into this shared infrastructure package.

## Tenant Isolation and Roles

Every tenant-owned table must have a non-null `tenant_id`, forced row-level security, and a policy that checks the transaction-local tenant setting. Use `withTenantContext(db, tenantId, work)` and pass its transaction handle through the complete operation; do not set tenant context on a pooled connection outside that transaction. Use composite foreign keys and tenant-scoped uniqueness where needed to prevent cross-tenant references. Integration tests must exercise tenant-scoped operations through the restricted runtime role and verify cross-tenant denial, mismatched writes, absent context, and pooled-connection isolation. Use privileged roles only for the fixture/setup work that requires them.

The API runtime uses `DATABASE_URL`. Migrations use `DATABASE_MIGRATION_URL`; trusted tenant provisioning uses `DATABASE_PROVISIONER_URL`. Never expose privileged URLs to the browser or use them for ordinary tenant requests. Keep role grants and RLS policy changes in reviewed migrations.

## Schema and Migration Workflow

Change `src/schema.ts`, then run `pnpm db:generate` from the workspace root. Review the generated SQL and snapshot under `drizzle/`, checking RLS enablement/policies, grants, foreign keys, uniqueness, indexes, and data safety. Test migrations against the local database, then commit schema and generated migration together. Never rewrite an already-applied migration; add a new migration for subsequent changes. Treat destructive or non-null changes as data migrations that need a safe rollout plan.

Use `pnpm db:migrate` to apply migrations, `pnpm db:setup-runtime-role` to create/update the local restricted role, `pnpm db:provision-tenant -- ...` for trusted bootstrap, and `pnpm db:check` to check connectivity. Local secrets and connection roles are documented in `.env.example` and `docs/development/local-setup.md`.

## Tests and Code Style

Place unit tests beside their implementation as `*.spec.ts`; PostgreSQL integration tests use `*.integration.spec.ts`. Use deterministic fixtures and clean up provisioned data. Run `pnpm --filter @classloom/db test`, `pnpm --filter @classloom/db typecheck`, and `pnpm --filter @classloom/db build` as relevant. Database integration tests need environment variables loaded, for example `pnpm exec dotenv -e .env -- pnpm --filter @classloom/db test`. Follow existing TypeScript and Drizzle patterns, and keep exported helpers explicit and narrowly scoped.
