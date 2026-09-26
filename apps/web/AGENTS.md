<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# ClassLoom Web App Instructions

## App Structure and Architecture

The App Router lives in `src/app/`, shared UI components in `src/components/`, and API clients and small helpers in `src/lib/`. Keep route pages focused on loading and composing features. Prefer Server Components; add `'use client'` only for browser APIs, local interactive state, or event handlers. Check the installed Next.js 16 documentation under `node_modules/next/dist/docs/` for APIs that may have changed.

The web app owns presentation and interaction. The API is authoritative for authentication, permissions, tenant selection, and data validation. Never treat hidden controls, route visibility, or client state as an authorization boundary.

## Authentication and API Calls

Use the existing same-origin route handlers under `src/app/api/` for browser API requests. Authentication requests must preserve the host-only session cookie behavior; browser mutations must send `X-ClassLoom-Request: 1` and rely on the API's exact-origin checks. Server-rendered protected pages should resolve the session through the existing server helper and redirect unauthenticated users as the current pages do. Do not expose `API_INTERNAL_URL` or privileged database URLs to client code.

For academic setup, use the existing API helpers and `school.read`/`school.manage` flows. Clear dependent selections when their parent selection changes, and display validation or authorization errors in the relevant form. Follow `docs/development/authentication.md` and `docs/development/academic-setup.md` when changing those flows.

## UI Components and Accessibility

Use the existing design tokens, Tailwind CSS 4, and `components/ui/` primitives. This project uses shadcn's Base UI based components (`apps/web/components.json`); do not introduce Radix primitives or a second component system. Extend shared components when the behavior is reusable; keep feature-specific UI with its route or feature. Preserve keyboard operation, semantic labels, visible focus, responsive layouts, and loading, empty, and error states.

## Design Skills and React Practices

For shadcn/ui work, follow the repository skill at `.agents/skills/shadcn/SKILL.md` throughout the project. It is already checked in; in a checkout where it is missing, install it with `npx skills add shadcn/ui`. Use the shadcn MCP to search registries and inspect component examples before adding or composing components. If the MCP is unavailable in a local environment, use the shadcn CLI and the repository skill. Keep the configured Base UI style and review generated component changes.

Apply Vercel's `vercel-react-best-practices` skill when creating or changing React code. If it is not available in the environment, install it with `npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices`.

For non-trivial feature work, use the BMAD (Breakthrough Method for Agile AI Driven Development) approach: think through the request, product intent, scope, design, and acceptance criteria before implementation, then implement, verify, and iterate. Keep the reasoning proportional to the change.

## Dates and Sample Data

Use `date-fns` for date formatting and calculations instead of hand-written date arithmetic. Respect the school's configured timezone and the API's date formats; do not assume the browser's local timezone is the school's timezone. If `date-fns` is not yet a direct web dependency when needed, add it to `@classloom/web` with `pnpm --filter @classloom/web add date-fns`.

Use Faker.js (`@faker-js/faker`) to create plausible development, demo, and test data. Seed Faker in tests that need repeatable fixtures, keep it in development/test dependencies, and never use it for authentication tokens, security decisions, or real school data. If the package is not installed when fixtures are needed, add it with `pnpm --filter @classloom/web add -D @faker-js/faker`.

## Tests and Checks

Place focused Vitest tests beside the helper or feature, using the existing `*.test.ts` naming pattern in this app. Run `pnpm --filter @classloom/web test`, `pnpm --filter @classloom/web lint`, and `pnpm --filter @classloom/web typecheck` as relevant. Use root commands for workspace-wide verification. Update screenshots or UX documentation only when required by the change.
