# Repository Guidelines

## Project Structure

ClassLoom is a pnpm monorepo: `apps/web` is the Next.js frontend, `apps/api` is the NestJS REST API, and `packages/db` owns Drizzle schemas, PostgreSQL access, and SQL migrations in `packages/db/drizzle/`. Tests live beside source; API end-to-end tests also use `apps/api/test/`. Product scope and delivery phases are in `docs/product` and `docs/superpowers`; architecture and security boundaries are in `docs/architecture`; accepted decisions are in `docs/decisions`.

## Agent Workflow

Before a change, read the closest `AGENTS.md`, inspect the relevant implementation and tests, and consult product or architecture docs when behavior, data ownership, security, or module contracts are involved. Follow established package patterns. Do not add unrequested product behavior, broad refactors, or speculative infrastructure. Keep documentation in sync with behavior and architecture changes. Record significant, hard-to-reverse design changes as an ADR.

## Architecture and Security Invariants

The API is a modular monolith. A domain owns its business rules and data access; modules interact through explicit application contracts, not another module's tables. The API enforces authorization; frontend visibility is only a user experience choice. Tenant context comes from the authenticated server-side membership, never an untrusted client tenant ID. Every tenant-owned database operation must use the established tenant context and forced row-level security. Do not expose migration or provisioner credentials to application clients.

## Database Changes

Edit schema in `packages/db/src/schema.ts`, generate migrations with `pnpm db:generate`, inspect generated SQL, and commit schema and migration together. Add a new migration for changes to an already-applied migration. Preserve tenant-scoped foreign keys, uniqueness, RLS policies, and runtime-role grants. Use `DATABASE_MIGRATION_URL` for migrations and `DATABASE_PROVISIONER_URL` only for trusted provisioning operations.

## Commands and Verification

Use Node.js 24.15+ and pnpm 11.19. Common root commands are `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Local PostgreSQL uses port 5433: follow `README.md` and `docs/development/local-setup.md` to configure `.env`, start Docker services, set up the runtime role, migrate, and provision a tenant. Database-backed tests need environment variables loaded: `pnpm exec dotenv -e .env -- pnpm test`. API end-to-end tests use `pnpm --filter @classloom/api test:e2e`; load `.env` with dotenv when their PostgreSQL credentials are needed. Report checks as passing only when run.

## Style and Contributions

Follow `.editorconfig` (UTF-8, LF, two spaces, final newline). Web linting uses ESLint; API linting uses Oxlint; Vitest runs tests. Use `*.spec.ts` for unit tests and `*.e2e-spec.ts` for API end-to-end tests. Commit subjects follow the observed `type: imperative summary` format (for example, `docs: update local setup`). PRs should summarize purpose and affected areas, link relevant issues or design docs, list verification run, and include screenshots for UI changes. Keep secrets out of version control; `.env.example` contains development placeholders only.

Name phase branches `phase-N-descriptive-name` without a `codex/` prefix.
