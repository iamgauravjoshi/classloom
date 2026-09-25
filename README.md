# ClassLoom

School management SaaS for Indian schools. This repository currently contains the Phase 0 engineering foundation and a sample UI shell. School business workflows are introduced in later phases.

## Requirements

- Node.js 24.15 or newer
- pnpm 11.19
- Docker Desktop with Compose for local PostgreSQL

## Local setup

1. `pnpm install`
2. Copy `.env.example` to `.env` and keep the development values or set local equivalents.
3. `docker compose up -d db`
4. `pnpm db:migrate`
5. `pnpm dev`

Open the web app at `http://localhost:3000`. The API health endpoint is `http://localhost:4000/api/v1/health` and API docs are at `http://localhost:4000/api/docs`.

## Checks

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. `pnpm db:check` tests database connectivity using `DATABASE_URL`.

## Project layout

- `apps/web` — Next.js application and ClassLoom UI shell
- `apps/api` — NestJS API foundation
- `packages/db` — Drizzle schema, migrations, and connectivity
- `docs` — product, architecture, decisions, and development notes

The [Phase 0 spec](docs/superpowers/specs/2026-09-25-phase-0-foundation-design.md) and [implementation plan](docs/superpowers/plans/2026-09-25-phase-0-foundation.md) explain the current scope.
