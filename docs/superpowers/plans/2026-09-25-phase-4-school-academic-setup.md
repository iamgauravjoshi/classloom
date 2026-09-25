# Phase 4 school academic setup implementation plan

**Goal:** Implement school scoped academic configuration and a usable administrator UI.

**Architecture:** Drizzle tenant owned tables and repository operations, a Nest academics module with scoped authorization, and a Next configuration page in the existing shell.

**Tech Stack:** PostgreSQL, Drizzle, NestJS, Zod, Next.js, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-25-phase-4-school-academic-setup-design.md`

**Global constraints:** Preserve RLS, composite school references, server derived tenant, school scoped permissions, and local ignored `.env` secrets. Use TDD for behavior changes.

**Review focus:** Activation race safety; cross tenant and cross school writes; existing role compatibility; UI error states.

## Tasks

1. Write failing schema and repository tests for academic relationships and tenant isolation. Add tables and generate the Drizzle migration; implement tested repository operations.
2. Write failing API tests for authorization, validation and operations. Add the academics Nest module and endpoints, then pass tests.
3. Read local Next App Router docs. Write UI tests for academic API helpers and configuration state. Build the setup page using existing shell and shadcn components, then pass tests.
4. Update architecture, API and local setup documentation. Verify migration, lint, typecheck, tests, E2E and build. Review the branch and fix issues.
