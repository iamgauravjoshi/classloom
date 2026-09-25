# Repository Guidelines

## Project Structure & Module Organization

This pnpm workspace contains `apps/web` (Next.js UI), `apps/api` (NestJS API), and `packages/db` (Drizzle schema, migrations, and database access). Application code lives under each package's `src/`; API end-to-end tests live in `apps/api/test/`. Keep unit tests beside the code they cover. Use `docs/product`, `docs/architecture`, `docs/decisions`, and `docs/development` for scope, design, decisions, and contributor notes. The API is a modular monolith: keep domain contracts explicit and do not treat another module's tables as its public interface.

## Build, Test, and Development Commands

Use Node.js 24.15+ and pnpm 11.19. From the repository root:

- `pnpm install` installs workspace dependencies.
- Copy `.env.example` to `.env`, run `docker compose up -d db`, then `pnpm db:setup-runtime-role` and `pnpm db:migrate` to prepare local PostgreSQL.
- `pnpm dev` starts the web app and API at ports 3000 and 4000.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` run checks across all workspace packages.
- `pnpm db:generate` creates a migration after schema changes; `pnpm db:check` checks database connectivity.

## Coding Style & Naming Conventions

Follow `.editorconfig`: UTF-8, LF endings, two-space indentation, and a final newline. Use TypeScript and the conventions of the package you edit. The web app uses ESLint with Next.js rules; the API uses Oxlint and has a `format` script for Prettier. Name unit tests `*.spec.ts` and API end-to-end tests `*.e2e-spec.ts`. Keep schema changes in `packages/db` and commit generated Drizzle migrations with them. Read `apps/web/AGENTS.md` before changing Next.js code.

## Testing Guidelines

Vitest runs unit tests across the workspace. Run API end-to-end tests with `pnpm --filter @classloom/api test:e2e` and API coverage with `pnpm --filter @classloom/api test:cov`. Add focused tests for domain rules, API behavior, and database adapters; use PostgreSQL for integration tests. The testing strategy requires tenant-isolation integration tests for every tenant-owned module when those modules are introduced. No numeric coverage threshold is specified.

## Commit & Pull Request Guidelines

The recorded commits use concise, scoped subjects such as `docs: plan Phase 0 foundation`; follow that `type: imperative summary` pattern. In pull requests, explain the change and its scope, link the relevant issue or design document, list commands run, and include screenshots for visible UI changes. Update related documentation when behavior or architecture changes.

## Security & Configuration

Keep secrets in ignored `.env` files; use `.env.example` only for safe local defaults. Never commit production database credentials. Preserve tenant boundaries and authorization checks when adding school-owned data.
