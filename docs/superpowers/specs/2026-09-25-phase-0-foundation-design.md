# ClassLoom Phase 0 Foundation Design

## Purpose and scope

ClassLoom is a production-oriented, multi-tenant school management SaaS for Indian schools. Phase 0 supplies the engineering and UI foundations needed before tenant, identity, and academic modules are built. It does not create student, attendance, fee, exam, or payment business workflows.

The live [PreSkool demo](https://preskool.dreamstechnologies.com/html/) is the visual source of truth. The linked Figma kit is an older version and is supporting reference only. ClassLoom uses its own name and mark. Implemented screens should closely match the live reference's composition, spacing, typography, interaction patterns, and responsive behavior; the demo's 348 navigation destinations are not a Phase 0 feature list.

## Product boundaries

The MVP follows the supplied master brief's operating loop: school setup, academic configuration, people/enrollment, admissions, timetable, attendance, fees/payments, exams/results, communication, reporting, and academic rollover. HR/payroll, library, transport, hostel, inventory, AI, and other ancillary areas stay deferred. Navigation only exposes implemented or explicitly marked preview screens, so a visible link never masquerades as a working workflow.

## Architecture

- **Workspace:** pnpm workspace with `apps/web`, `apps/api`, and `packages/db`. TypeScript strict mode, ESLint, formatting, and shared scripts live at the root.
- **Web:** Next.js App Router, React, Tailwind CSS, and shadcn/ui. Phase 0 renders a responsive application shell and a clearly labeled sample dashboard using deterministic fixture data. It does not call unimplemented business APIs.
- **API:** NestJS modular monolith with `/api/v1/health`, global validation and error handling, request IDs, structured logging, and OpenAPI. Domain modules will be added one phase at a time.
- **Data:** PostgreSQL with Drizzle ORM and versioned SQL migrations. The first migration creates only an `app_metadata` foundation table. Docker Compose starts PostgreSQL locally. Redis, object storage, and queues are added when a concrete workflow needs them.
- **Tenant model:** future tenant-owned tables carry a non-null `tenant_id`; campus and academic-session IDs are additional scopes. Tenant resolution, authorization, tenant-aware repositories, and PostgreSQL row-level security form defense in depth. Phase 1 implements the first tenant tables and proves cross-tenant isolation with integration tests.
- **Identity:** a global account may join multiple tenant memberships; students, guardians, and staff remain separate domain entities with optional account links. Phase 2 will add opaque, revocable sessions in secure HttpOnly cookies. Phase 3 adds permission, scope, relationship, and workflow-state checks at the API boundary.

## UI foundation

Use the live reference's 280 px sidebar, 60 px top bar, Inter typography, blue primary (`#3d5ee1`), pale canvas, white cards with light borders and approximately 16 px corners. Build these as semantic design tokens in the shadcn theme rather than scattered color literals. The shell contains ClassLoom branding, workspace switcher placeholder, grouped navigation, search entry, theme control, notifications placeholder, and account placeholder. At narrow widths, navigation becomes a sheet. Keyboard focus, accessible names, and contrast are required.

Reusable Phase 0 primitives include page heading/breadcrumb, metric card, action toolbar, empty state, error state, loading skeleton, and confirmation dialog. The sample dashboard demonstrates composition only; realistic Indian demo data is clearly identified as sample data. A source-reference checklist records representative live pages used for visual comparison: admin, teacher, student, and parent dashboards; student grid/list/profile/form; attendance; fee collection; marks entry; login; UI button examples; and dark layout.

## Operational standards

API endpoints use `/api/v1`, consistent error envelopes, ISO timestamps, request IDs, and OpenAPI descriptions. Environment variables are validated at startup; secrets stay outside version control. Logs omit student personal data and credentials. Date-only values will be distinct from timestamps and displayed in configurable Indian formats when business modules arrive. CI runs lint, typecheck, tests, and builds. Local setup and architectural decisions live under `docs/`.

## Phase 0 acceptance criteria

1. A new developer can install dependencies, start PostgreSQL, apply migrations, and run web/API locally from documented commands.
2. The web shell renders at desktop and mobile widths, with a working navigation toggle and theme control, and shows a sample dashboard without dead business actions.
3. `/api/v1/health` returns a predictable status and request ID; error responses use the documented envelope.
4. A versioned migration can be applied from a clean database and is safe to rerun.
5. Lint, typecheck, unit tests, and builds pass in CI and locally; a browser smoke check covers the shell.
6. The requested shadcn skill is installed and the shadcn MCP entry is present in Codex config (loading the server requires an app restart).

## Risks and decisions

The reference is a template, not a domain specification. Its visual design can be matched while domain rules come from the master brief. The linked Figma canvas contains older screens; the live site wins when they conflict. Phase 0 contains no tenant-owned business tables, so the first meaningful RLS isolation test belongs in Phase 1. Drizzle is selected because its explicit SQL migrations make RLS policies reviewable alongside schema changes.
