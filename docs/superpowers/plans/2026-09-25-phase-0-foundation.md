# ClassLoom Phase 0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a runnable, documented, tested web/API/database foundation and a PreSkool-inspired ClassLoom UI shell.

**Architecture:** A pnpm workspace holds a Next.js web app, NestJS API, and Drizzle database package. PostgreSQL is local in Docker. The UI is composed from shadcn components and semantic theme tokens. No school business module is implemented in Phase 0.

**Tech Stack:** Node 24, pnpm 11, TypeScript, Next.js, React, Tailwind, shadcn/ui, NestJS, PostgreSQL, Drizzle, Vitest/Jest, ESLint, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-25-phase-0-foundation-design.md`

## Global Constraints

- Match the current live PreSkool visual system while using ClassLoom branding.
- Keep student, attendance, fee, exam, and payment workflows out of Phase 0.
- Use strict TypeScript and route API endpoints under `/api/v1`.
- Tenant-owned records require `tenant_id` and RLS when introduced in Phase 1; do not add placeholder tenant data tables now.
- Keep Redis, queues, and object storage out until a workflow needs them.
- Never commit secrets; document local environment values through `.env.example` files.

## Review Focus

- Missing database: API health must identify database readiness separately from process liveness.
- Invalid environment: startup must fail with a useful configuration error.
- Unknown API path: return the documented error envelope with request ID.
- Small viewport: sidebar navigation must remain reachable by keyboard and close after selection.
- Placeholder controls: a visible business action must not pretend to complete a workflow.

---

### Task 1: Workspace and architecture documents

**Files:** Create root `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.editorconfig`, `.env.example`, `README.md`, and `docs/{README.md,product/mvp-scope.md,architecture/architecture-overview.md,architecture/module-boundaries.md,architecture/multi-tenancy.md,architecture/identity-and-access.md,development/testing-strategy.md,development/local-setup.md,decisions/ADR-0001-*.md}`.

**Interfaces:** Produces root commands `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm db:migrate` for later tasks.

- [ ] Write the file/command contract in `README.md`, including required Node/pnpm versions and exact local setup sequence.
- [ ] Create workspace manifests and ignore files. Keep `apps/*` and `packages/*` as workspaces.
- [ ] Document MVP scope, module boundaries, shared database plus RLS strategy, account/domain separation, testing, and ADRs.
- [ ] Verify the workspace with `pnpm install` and `pnpm -r list --depth -1`; correct any package discovery errors.
- [ ] Commit as `chore: establish Phase 0 workspace and docs`.

### Task 2: API foundation

**Files:** Create `apps/api/package.json`, `tsconfig*.json`, `nest-cli.json`, `src/main.ts`, `src/app.module.ts`, `src/health/*`, `src/common/{request-id.middleware.ts,http-exception.filter.ts}`, `src/config/env.ts`, and tests under `apps/api/test`.

**Interfaces:** Produces `GET /api/v1/health` with `{status, database, requestId, timestamp}` and error envelope `{code,message,details,requestId}`. Consumes `DATABASE_URL`, `PORT`, and `WEB_ORIGIN` from environment.

- [ ] Write a failing health test for the response shape and request ID header; run `pnpm --filter @classloom/api test` and confirm the missing behavior causes failure.
- [ ] Implement NestJS bootstrap, health module, request ID middleware, validated env, global exception filter, CORS, and OpenAPI.
- [ ] Write a failing test for an unknown route's error envelope; implement minimal filter behavior and verify red-to-green.
- [ ] Run API tests, lint, typecheck, and build; record outputs.
- [ ] Commit as `feat(api): add health and request foundation`.

### Task 3: Database and local infrastructure

**Files:** Create `packages/db/package.json`, `src/{client.ts,schema.ts,index.ts}`, `drizzle.config.ts`, `drizzle/*`, `docker-compose.yml`, and database tests.

**Interfaces:** Exposes `createDb(databaseUrl)` and `checkDatabase(databaseUrl)` to the API. A migration creates `app_metadata(id,key,value,created_at,updated_at)` with a unique key.

- [ ] Write a failing database connectivity test for reachable and unreachable URLs; verify expected failure before implementation.
- [ ] Implement the Drizzle client and database check; wire health to report `up` or `down` without exposing connection secrets.
- [ ] Generate the first SQL migration and add `db:migrate`/`db:check` scripts. Start PostgreSQL with `docker compose up -d db`, apply migration twice, and inspect the resulting table.
- [ ] Run database tests and API health both with DB running and stopped; restore DB after the negative check.
- [ ] Commit as `feat(db): add PostgreSQL migration foundation`.

### Task 4: Web shell and shadcn system

**Files:** Create `apps/web` Next.js app, `components.json`, `src/app/{layout.tsx,page.tsx,globals.css}`, `src/components/{app-shell,site-header,site-sidebar,theme-toggle,page-heading,metric-card}.tsx`, `src/lib/navigation.ts`, and navigation tests.

**Interfaces:** Web route `/` renders a sample admin dashboard and navigation entries for implemented pages only. `getNavigation(role)` returns safe visible groups; `/api/v1/health` is not required for the sample screen.

- [ ] Initialize Next.js and shadcn with the project runner; inspect `shadcn info`, search, and docs before adding Button, Card, Badge, Avatar, Sheet, Breadcrumb, Input, Skeleton, and Tooltip.
- [ ] Write failing navigation tests for group visibility, active route, and unavailable actions; verify red.
- [ ] Implement navigation model and responsive shell. Use semantic CSS variables for PreSkool-inspired light/dark palettes, ClassLoom wordmark, 280 px sidebar, 60 px header, and keyboard-operable mobile Sheet.
- [ ] Compose the sample dashboard from shadcn primitives and deterministic fixtures. Mark all sample values and keep unsupported business actions absent.
- [ ] Run navigation tests, lint, typecheck, and build; compare desktop and mobile browser renders to reference screenshots.
- [ ] Commit as `feat(web): add ClassLoom application shell`.

### Task 5: CI, final verification, and handoff

**Files:** Create `.github/workflows/ci.yml`; update `README.md`, setup/testing docs, and any files needed for verification fixes.

**Interfaces:** CI executes install, lint, typecheck, test, and build with PostgreSQL service where integration checks require it.

- [ ] Add CI workflow and deterministic lockfile install.
- [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and migration verification from a clean database.
- [ ] Start web and API; verify desktop/mobile shell, navigation, theme, health response, error response, and accessibility basics in browser.
- [ ] Compare acceptance criteria line by line with evidence and document any limitation.
- [ ] Commit as `ci: verify Phase 0 foundation`.
