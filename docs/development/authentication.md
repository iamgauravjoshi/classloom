# Authentication development

## Local services

Copy `.env.example` to `.env`, install dependencies, then start PostgreSQL and Mailpit with `docker compose up -d db mailpit`. Mailpit's inbox is at [http://localhost:8025](http://localhost:8025). API delivery uses SMTP at `localhost:1025` by default.

Run `pnpm db:setup-runtime-role` once, then `pnpm db:migrate`. The API uses the restricted `DATABASE_URL`; migrations use `DATABASE_MIGRATION_URL`. Do not run the API as the migration or provisioner role.

## Invite a user

Provision a tenant and school with the documented tenant command, then issue an invitation through the trusted CLI:

```powershell
pnpm --filter @classloom/api auth:invite -- <tenant-id> person@example.test
```

The command sends a link and prints only the invitation ID. The recipient completes `/accept-invitation`. Existing accounts must sign in and use the same invitation with the authenticated membership acceptance flow.

## Browser flows

- `/login` creates a server-side session and host-only HttpOnly cookie.
- `/select-workspace` selects one of the signed-in account's active memberships.
- `/forgot-password` always shows the same success message; check Mailpit for a matching account's email.
- `/reset-password` accepts a single-use token, changes the password, and revokes all sessions.
- `/accept-invitation` creates a new account from a trusted invitation.

Browser writes use exact-origin validation and the `X-ClassLoom-Request: 1` marker. `WEB_ORIGIN` must match the web app origin. Use HTTPS and secure cookies outside local development.

Browser authentication calls go through the same-origin Next.js `/api/auth/*` proxy. It forwards the host-only session cookie to the API and reissues `Set-Cookie` on the web host so dashboard server rendering can validate sessions when the API uses a different hostname. Set `API_INTERNAL_URL` to the private API base URL; keep `NEXT_PUBLIC_API_URL` only for compatibility with direct local API tooling. In deployments behind a known reverse proxy, set `TRUSTED_PROXY_HOPS` to the exact proxy hop count so source-based throttling uses the client address. The edge proxy must overwrite forwarded-address headers.

## Verify

Run `pnpm --filter @classloom/db test` and `pnpm --filter @classloom/api test`; PostgreSQL integration tests run when both `DATABASE_URL` and `DATABASE_MIGRATION_URL` are set. Then run `pnpm test:e2e`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.

## Authorization roles

Phase 3 authorization uses the active session membership and tenant. The permission catalog is application-owned; each tenant receives the built-in role templates during provisioning. Tenant administrators can create custom roles and assign roles at tenant, school, or campus scope. Assignment writes require `authorization.roles.manage`; catalog and role reads require `authorization.roles.read`. Role changes and their audit events commit in the same database transaction. Academic and relationship scopes remain unavailable until their domain modules can resolve them.

To bootstrap the first tenant administrator, first ensure the person has an active membership in the tenant, then run:

```powershell
pnpm --filter @classloom/api auth:bootstrap-admin -- <tenant-id> person@example.test
```

The CLI uses the application's restricted runtime database URL, grants only the built-in tenant administrator role at tenant scope, and records a trusted-bootstrap audit event. Repeating it is safe.
