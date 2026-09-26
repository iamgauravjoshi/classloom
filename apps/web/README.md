# ClassLoom Web App

The frontend is a Next.js App Router application in `src/app/`. Shared shadcn components are in `src/components/ui/`; API clients and helpers are in `src/lib/`. The project uses React, TypeScript, Tailwind CSS 4, shadcn/ui with Base UI primitives, and Lucide icons.

## Development

From the repository root, follow the [local setup guide](../../README.md#local-development-setup), then run `pnpm dev`. The root script builds the shared database package, loads `.env`, and starts the web app and API. The web app is served at `http://localhost:3000`.

Useful package commands:

```bash
pnpm --filter @classloom/web test
pnpm --filter @classloom/web lint
pnpm --filter @classloom/web typecheck
pnpm --filter @classloom/web build
```

## Frontend Conventions

Read [`AGENTS.md`](AGENTS.md) before changing frontend code. It contains the detailed requirements for Next.js 16, server/client boundaries, API proxy and session handling, Base UI components, accessibility, shadcn and React skills, date-fns, Faker.js, and the BMAD feature workflow. Use `.agents/skills/shadcn/SKILL.md` and the shadcn MCP; if MCP is unavailable, use the shadcn CLI. Preserve the Base UI base configured in `components.json`.

Protected pages must rely on server-resolved sessions, and the API remains authoritative for permissions and tenant access. Browser API mutations must preserve the existing same-origin proxy and CSRF header behavior. Do not expose `API_INTERNAL_URL` to client-side code.

See [authentication development](../../docs/development/authentication.md) and [academic setup](../../docs/development/academic-setup.md) for the implemented flows.
