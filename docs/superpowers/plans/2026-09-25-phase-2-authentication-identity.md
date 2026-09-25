# Phase 2 Authentication and Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement invitation-based email/password authentication with revocable server sessions, password recovery, and membership-derived tenant context.

**Architecture:** Add global account and session records plus tenant-scoped memberships and invitation records in PostgreSQL. The Nest API owns credential verification, session cookies, CSRF and rate-limit enforcement, SMTP delivery, and authenticated tenant resolution; Next.js provides the login and onboarding screens. The database remains the authority for tenant isolation, while Phase 3 will add business permissions.

**Tech Stack:** pnpm 11.19, Node.js 24.15+, NestJS 12, Next.js 16.3.6, TypeScript, Drizzle ORM/PostgreSQL 17, Vitest, Supertest, Argon2id (`argon2`), SMTP (`nodemailer`), and Mailpit for local email.

**Spec:** `docs/superpowers/specs/2026-09-25-phase-2-authentication-identity-design.md`

## Global Constraints

- Email/password is the first-party login method; accounts are created through trusted invitations, with no public self-registration.
- Passwords use Argon2id, have a 15-character minimum, accept at least 64 characters, and have no composition rules.
- Session tokens have 256 bits of randomness; only SHA-256 token hashes are persisted.
- Session idle expiry is 12 hours and absolute expiry is 7 days; reset and account suspension revoke all sessions.
- Session cookies are host-only, `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production.
- Tenant context comes only from a validated active membership; caller tenant IDs and headers are ignored.
- Membership/account suspension blocks the next authenticated request; authorization roles and permissions remain Phase 3 work.
- Password reset responses do not disclose account existence; reset tokens are hashed, single-use, and expire after one hour.
- Invitation acceptance is single-use, email-bound, and defaults to a seven-day expiry.
- Rate limits are shared through PostgreSQL and temporary; permanent account lockout is prohibited.
- SMTP configuration and secrets remain server-side; local mail uses Mailpit and `.env.example` contains safe placeholders.
- Never log or persist raw passwords, session tokens, invitation tokens, or reset tokens.
- Preserve the Phase 1 non-owner runtime role, forced RLS, and transaction-local tenant context.

## Review Focus

1. **Concurrent invitation replay:** two acceptance requests for one token must result in one membership and one successful consume; owned by Task 6's PostgreSQL integration and API tests.
2. **Memberships across tenants:** workspace choices must include only the authenticated account's active memberships without opening cross-tenant membership access; owned by Task 2's RLS integration tests and Task 5's API tests.
3. **Suspension between requests:** suspending an account or selected membership must reject the next request even when a session cookie remains; owned by Task 5's guard tests.
4. **Cookie and CSRF boundaries:** production cookies must be secure, untrusted origins must fail, and local HTTP must work only in explicit development configuration; owned by Tasks 3 and 5.
5. **Enumeration and rate-limit behavior:** unknown and known reset emails return the same public response, and repeated attempts throttle across API instances without permanent lockout; owned by Task 6's tests.

---

### Task 1: Add identity schema and migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: next generated migration and snapshot under `packages/db/drizzle/`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Modify: `packages/db/src/tenant-schema.spec.ts`
- Create: `packages/db/src/identity-schema.spec.ts`

**Interfaces:**
- Export Drizzle tables for accounts, credentials, memberships, sessions, invitations, password reset tokens, security events, and auth rate limits from `packages/db/src/schema.ts`.
- Sessions must enforce account/membership correspondence with a composite foreign key; memberships must have tenant-safe keys and account/tenant uniqueness.
- Membership row policies must permit a transaction-local account context for that account's membership choices and tenant context for tenant operations; both access paths require explicit context. Invitations remain tenant-scoped.

- [ ] **Step 1: Write schema contract tests first**

Add tests that assert the generated PostgreSQL schema contains the identity tables, uniqueness and foreign-key constraints, membership RLS policy, and session-to-membership account constraint. Include a policy test showing missing account and tenant contexts expose no membership rows.

```ts
it('requires an explicit account or tenant context to read memberships', async () => {
  const rows = await queryMembershipsWithoutContext();
  expect(rows).toEqual([]);
});

it('prevents a session from selecting another account membership', async () => {
  await expect(insertSession({ accountId: accountA, activeMembershipId: membershipB }))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --filter @classloom/db test -- src/identity-schema.spec.ts`
Expected: FAIL because identity tables and membership policies do not exist.

- [ ] **Step 3: Define tables, constraints, and RLS policies**

Add typed status values or validated text fields following existing schema conventions. Normalize email into a dedicated canonical column with a unique index. Keep account/session/control records globally addressable only through explicit server repositories. Make membership reads require `app.account_id` or `app.tenant_id`, and tenant-owned writes require tenant context. Add expiry and lookup indexes for token hashes, session account, status, and limit windows.

- [ ] **Step 4: Generate and inspect the migration**

Run: `pnpm db:generate`
Expected: a new migration creates all Phase 2 tables, constraints, grants/RLS policies, and indexes without modifying earlier migration history.

- [ ] **Step 5: Run schema and database package checks**

Run: `pnpm --filter @classloom/db test`
Expected: PASS; existing tenant schema tests remain unchanged and identity contract tests pass.

### Task 2: Add account-scoped DB context and identity repositories

**Files:**
- Create: `packages/db/src/account-context.ts`
- Create: `packages/db/src/account-context.spec.ts`
- Create: `packages/db/src/identity-repository.ts`
- Create: `packages/db/src/identity-repository.spec.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/src/setup-runtime-role.ts` and its test if grants are enumerated explicitly
- Modify: `packages/db/src/tenant-schema.spec.ts`

**Interfaces:**
- `withAccountContext<T>(db, accountId, work): Promise<T>` validates UUID input, opens a transaction, sets transaction-local `app.account_id`, and passes the transaction-scoped Drizzle handle to `work`.
- Tenant-owned repository functions accept explicit tenant context or a transaction produced by `withTenantContext`; they never derive it from request data.
- Identity repositories provide atomic account/credential/membership creation, session create/read/update/revoke, own-membership listing, invitation consume, reset-token consume, and shared rate-limit operations.

- [ ] **Step 1: Write account-context isolation tests**

Test valid UUID context, invalid UUID rejection before opening a transaction, transaction-local `set_config`, rollback propagation, and pooled-connection reuse that does not retain the previous account ID.

```ts
it('clears account context when the transaction ends', async () => {
  await withAccountContext(db, accountA, async (tx) => expect(await visibleMemberships(tx)).toEqual([membershipA]));
  await expect(visibleMemberships(db)).resolves.toEqual([]);
});
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm --filter @classloom/db test -- src/account-context.spec.ts`
Expected: FAIL because the helper is not implemented.

- [ ] **Step 3: Implement account context and export it**

Follow `packages/db/src/tenant-context.ts`: set account ID with transaction-local `set_config(..., true)` and pass only the transaction handle into the callback. Do not add a helper that accepts caller-provided membership or tenant values as trusted context.

- [ ] **Step 4: Write repository transaction tests**

Test atomic account/credential/membership creation, own-membership filtering, one-time invitation consumption under concurrent attempts, one-time reset-token consumption, session revocation, and shared throttle windows using PostgreSQL.

- [ ] **Step 5: Implement repositories and runtime grants**

Use Drizzle transactions for multi-row state changes. Add least-privilege grants for the API runtime role, including access to the new identity tables and needed sequences/functions. Preserve the separate migration/provisioner credentials and existing RLS constraints.

- [ ] **Step 6: Run database tests and typecheck**

Run: `pnpm --filter @classloom/db test`
Run: `pnpm --filter @classloom/db typecheck`
Expected: PASS against PostgreSQL with the configured non-superuser runtime role for integration cases.

### Task 3: Add API auth configuration, database wiring, and dependencies

**Files:**
- Modify: `apps/api/src/config/env.ts` and `apps/api/src/config/env.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Create: `apps/api/src/database/database.module.ts`
- Create: `apps/api/src/database/database.provider.ts`
- Create: `apps/api/src/auth/auth.module.ts`

**Interfaces:**
- Parsed configuration exposes API origin, cookie settings, idle/absolute session lifetimes, reset/invitation lifetime, Argon2 parameters, shared rate-limit thresholds, and SMTP settings.
- Production configuration rejects missing SMTP credentials, non-HTTPS public origin, and disabled secure cookies; local HTTP is allowed only when `NODE_ENV` is explicitly non-production.
- Nest database provider supplies one application-lifetime Drizzle client using `DATABASE_URL` and closes its pool on shutdown.

- [ ] **Step 1: Add environment parser tests**

Test safe development defaults, valid SMTP configuration, missing required production SMTP or cookie settings, invalid origin schemes, and limits outside their allowed ranges.

```ts
it('requires Secure cookies in production', () => {
  expect(() => parseEnv({ ...validProductionEnv, AUTH_COOKIE_SECURE: 'false' })).toThrow(/AUTH_COOKIE_SECURE/);
});
```

- [ ] **Step 2: Run the parser tests and confirm failure**

Run: `pnpm --filter @classloom/api test -- src/config/env.spec.ts`
Expected: FAIL on the new auth configuration cases.

- [ ] **Step 3: Implement validated configuration and DB injection**

Reuse `parseEnv` as the sole environment parser. Inject the Drizzle client through a Nest token and register auth providers through `AuthModule`; do not create a fresh connection per request.

- [ ] **Step 4: Add SMTP dependencies and local Mailpit service**

Add `argon2` and `nodemailer` to `apps/api`; add Mailpit to Docker Compose on local-only ports with no production credentials. Extend `.env.example` with safe SMTP and auth placeholders.

- [ ] **Step 5: Verify configuration and package wiring**

Run: `pnpm --filter @classloom/api test -- src/config/env.spec.ts`
Run: `pnpm --filter @classloom/api typecheck`
Expected: PASS and application bootstrap uses exact-origin CORS with credentials.

### Task 4: Implement password policy, hashing, and opaque token primitives

**Files:**
- Create: `apps/api/src/auth/password.service.ts`
- Create: `apps/api/src/auth/password.service.spec.ts`
- Create: `apps/api/src/auth/token.service.ts`
- Create: `apps/api/src/auth/token.service.spec.ts`
- Create: `apps/api/src/auth/auth.constants.ts`

**Interfaces:**
- `PasswordService.hash(password: string): Promise<string>` and `verify(hash: string, password: string): Promise<boolean>` use Argon2id.
- `TokenService.createSessionToken(): { raw: string; hash: string }` generates 32 random bytes and SHA-256; equivalent opaque-token methods serve invitation and reset tokens.
- Password policy rejects fewer than 15 or more than 256 Unicode code points; it does not reject spaces, paste, or character categories.

- [ ] **Step 1: Write password and token tests**

Cover Argon2id algorithm metadata, correct/wrong password checks, boundaries 14/15/64/256/257, whitespace and Unicode passphrases, 32-byte session entropy, raw/hash distinction, deterministic hash lookup, and non-logging behavior.

```ts
it('accepts long passphrases and rejects values above the documented bound', () => {
  expect(validatePassword('a'.repeat(64))).toEqual({ success: true });
  expect(validatePassword('a'.repeat(257)).success).toBe(false);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @classloom/api test -- src/auth/password.service.spec.ts src/auth/token.service.spec.ts`
Expected: FAIL because auth primitives do not exist.

- [ ] **Step 3: Implement primitives**

Use configured Argon2id memory/time parameters and crypto APIs from Node. Return raw tokens only to the caller that sends the cookie/email; repositories receive hashes only.

- [ ] **Step 4: Run primitive tests**

Run: `pnpm --filter @classloom/api test -- src/auth/password.service.spec.ts src/auth/token.service.spec.ts`
Expected: PASS, including that the raw token is absent from the persisted-value test fixture.

### Task 5: Implement authentication services, guards, and HTTP flows

**Files:**
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.service.spec.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.guard.ts`
- Create: `apps/api/src/auth/auth.types.ts`
- Create: `apps/api/src/auth/csrf.guard.ts`
- Create: `apps/api/src/auth/auth.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- `AuthService.login(email, password, metadata)` verifies credentials, records a security event, creates a session, and chooses a membership only when exactly one active membership exists.
- `AuthGuard` attaches `{ accountId, sessionId, activeMembership }` after checking token hash, revocation/expiry, account status, and active membership status.
- `AuthService.selectMembership(accountId, sessionId, membershipId)` verifies ownership and active status before updating the current session.
- Task 5 implements `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`, `GET /auth/memberships`, and `POST /auth/membership`; Task 6 adds invitation and password-reset routes to the controller.
- Request bodies are `{ email, password }` for login, `{ membershipId }` for selection, `{ token, password, displayName? }` for new-account invitation acceptance, `{ email }` for reset request, and `{ token, newPassword }` for reset confirmation. Existing-account invitation acceptance also requires the authenticated session and omits password/display name.
- All state-changing browser requests send `X-ClassLoom-Request: 1` and enforce configured exact-Origin/Referer validation; all repository writes are transactional.

- [ ] **Step 1: Add failing service and guard tests**

Test login success/failure equivalence, cookie token persistence by hash, zero/one/multiple memberships, session idle and absolute expiry, revoked session, suspended account, suspended membership, own-membership selection, and rejection of another account's membership.

```ts
it('rejects membership selection for a different account', async () => {
  await expect(service.selectMembership(accountA, sessionA, membershipB)).rejects.toMatchObject({ status: 403 });
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @classloom/api test -- src/auth/auth.service.spec.ts`
Expected: FAIL because services and guards are not implemented.

- [ ] **Step 3: Implement login, session lookup, workspace selection, and logout**

Use generic login errors, update idle expiry without passing absolute expiry, and clear/revoke sessions idempotently on logout. Health and Swagger remain public; protected routes use the auth guard.

- [ ] **Step 4: Add Origin and CSRF enforcement**

Reject unsafe methods with absent or untrusted Origin/Referer and require `X-ClassLoom-Request: 1`. The static header is not a secret; browsers cannot add it through cross-site form submission, and credentialed CORS accepts only the configured exact origin. Cover login as a state-changing endpoint. Keep CORS allowlist exact and credentialed.

- [ ] **Step 5: Add API E2E cases**

Use the existing Nest/Supertest harness in `apps/api/test/foundation.e2e-spec.ts` patterns. Verify `Set-Cookie` attributes, authenticated `/auth/session`, workspace selection, logout, generic credential failure, protected-route rejection, and CSRF rejection.

- [ ] **Step 6: Run API auth tests**

Run: `pnpm --filter @classloom/api test -- src/auth/auth.service.spec.ts`
Run: `pnpm --filter @classloom/api test:e2e`
Expected: PASS with cookies and statuses asserted from HTTP responses.

### Task 6: Add invitation, reset, SMTP, audit, and shared throttling flows

**Files:**
- Create: `apps/api/src/auth/email.service.ts`
- Create: `apps/api/src/auth/email.service.spec.ts`
- Create: `apps/api/src/auth/invitation.service.ts`
- Create: `apps/api/src/auth/invitation.service.spec.ts`
- Create: `apps/api/src/auth/password-reset.service.ts`
- Create: `apps/api/src/auth/password-reset.service.spec.ts`
- Create: `apps/api/src/auth/rate-limit.service.ts`
- Create: `apps/api/src/auth/rate-limit.service.spec.ts`
- Create: `packages/db/src/invite-membership.ts`
- Create: `packages/db/src/invite-membership.spec.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.e2e-spec.ts`
- Modify: `docker-compose.yml`, `.env.example`, and `apps/api/src/auth/auth.e2e-spec.ts`
- Create: trusted CLI entry under `apps/api/src/auth/invite-account.ts` and a root/package script for it

**Interfaces:**
- `EmailService.sendInvitation(...)` and `sendPasswordReset(...)` use configured SMTP and never log message tokens.
- `InvitationService.accept(rawToken, accountIdOrNewAccount)` validates hash, email, expiry, and status; repository consumption and membership insertion commit atomically.
- `PasswordResetService.request(email)` always returns the same public result; `confirm(rawToken, newPassword)` atomically consumes, updates the Argon2id hash, and revokes every account session.
- `RateLimitService.consume(scope, keyedSubjectDigest, now)` uses shared PostgreSQL state and returns allowed/retry metadata; configured throttles are temporary.
- Trusted invitation CLI accepts tenant ID and email as arguments, writes a hashed invitation, and sends through SMTP without printing a raw link or secret.
- Safe defaults: five failed logins per account/source pair per 15 minutes, ten invitation token attempts per source per 15 minutes, and three reset requests per source/email pair per hour; persist only keyed digests and expiry windows, and return retry metadata without permanent lockout.

- [ ] **Step 1: Write failure and replay tests**

Test unknown/known reset requests have identical response shape, reset token single use/expiry, all-session revocation, invitation email binding, existing-account authentication requirement, expired/replayed invitation rejection, concurrent replay, Mailpit SMTP delivery adapter, and cross-instance shared throttling.

```ts
it('consumes a concurrent invitation at most once', async () => {
  const results = await Promise.allSettled([accept(token), accept(token)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
});
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm --filter @classloom/api test -- src/auth/invitation.service.spec.ts src/auth/password-reset.service.spec.ts src/auth/rate-limit.service.spec.ts`
Expected: FAIL because those services are missing.

- [ ] **Step 3: Implement transactional invitation and reset services**

Create accounts, credentials, and initial memberships atomically. Require an authenticated matching account for an existing email. Use database uniqueness and row locking/conditional updates so concurrent token consumption has one winner.

- [ ] **Step 4: Implement provider-neutral SMTP and trusted invite command**

Use Nodemailer behind the email interface, point local configuration at Mailpit, and make command failures exit nonzero without leaking tokens. Add package scripts and safe environment examples.

- [ ] **Step 5: Implement shared PostgreSQL throttling and security events**

Throttle login by normalized account digest plus source digest, invitation acceptance by token/source digest, and reset request by source plus normalized email digest. Record auth outcomes with request ID, event type, and coarse metadata only.

- [ ] **Step 6: Run PostgreSQL integration and API E2E tests**

Run: `pnpm --filter @classloom/db test -- src/invite-membership.spec.ts`
Run: `pnpm --filter @classloom/api test:e2e`
Expected: PASS for concurrent replay, non-enumeration, expiry, revocation, and shared limit counters.

### Task 7: Build authentication and workspace web flows

**Files:**
- Create: `apps/web/src/lib/auth-api.ts`
- Create: `apps/web/src/lib/auth-api.test.ts`
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/forgot-password/page.tsx`
- Create: `apps/web/src/app/reset-password/page.tsx`
- Create: `apps/web/src/app/accept-invitation/page.tsx`
- Create: `apps/web/src/app/select-workspace/page.tsx`
- Create: `apps/web/src/components/auth-form.tsx`
- Create: `apps/web/src/components/auth-form.test.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`

**Interfaces:**
- `auth-api.ts` exports typed functions for login, logout, session, memberships, membership selection, invite acceptance, reset request, and reset confirmation; every fetch uses `credentials: 'include'` and the configured API URL.
- Server route checks use the documented Next 16 cookie/request guidance; server components may redirect based on session results while browser client code never reads HttpOnly cookies.
- Forms share accessible field/error/loading behavior and use the API's generic login/reset messages.

- [ ] **Step 1: Read local Next.js 16 guidance before code**

Read the installed guides for authentication, cookies, forms, and redirects from `apps/web/node_modules/next/dist/docs/`. Follow any current-version constraints on cookie access and server/client component boundaries.

- [ ] **Step 2: Write failing auth client and form tests**

Test credentialed fetch options, configured API origin, generic reset confirmation, validation states, loading/success/error rendering, and redirects for unauthenticated dashboard requests.

```ts
it('sends cookies and the required CSRF header to the API', async () => {
  await login({ email: 'a@example.test', password: 'long passphrase value' });
  expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    credentials: 'include', headers: expect.objectContaining({ 'X-ClassLoom-Request': '1' }),
  }));
});
```

- [ ] **Step 3: Implement typed API client and reusable accessible form controls**

Use existing shadcn inputs/buttons and keep copy direct. Support paste and password managers; never store password or session token in local storage.

- [ ] **Step 4: Implement the five auth routes and dashboard redirect**

Route successful login by the returned membership state: one selected membership goes to `/`, multiple memberships go to `/select-workspace`, and zero memberships shows a no-workspace state. The workspace picker displays API-provided choices only.

- [ ] **Step 5: Run web tests, lint, and typecheck**

Run: `pnpm --filter @classloom/web test`
Run: `pnpm --filter @classloom/web lint`
Run: `pnpm --filter @classloom/web typecheck`
Expected: PASS for routes, API client, accessible form states, and current Next.js conventions.

### Task 8: Integrate docs, migration, and complete verification

**Files:**
- Modify: `docs/architecture/identity-and-access.md`
- Modify: `docs/architecture/multi-tenancy.md`
- Create: `docs/development/authentication.md`
- Modify: `.env.example`, `docker-compose.yml`, and relevant root scripts as needed
- Modify: `apps/api/test/foundation.e2e-spec.ts` only if shared test bootstrap changes are needed

- [ ] **Step 1: Document local setup and operations**

Document Mailpit startup, migration order, required runtime/migration/provisioner roles, SMTP environment variables, trusted invitation command, cookie behavior, reset flow, and the Phase 2 authentication versus Phase 3 authorization boundary.

- [ ] **Step 2: Run migrations against the configured local PostgreSQL**

Run: `pnpm db:migrate`
Run: `pnpm db:setup-runtime-role`
Expected: migrations apply once and the non-superuser runtime role receives only the required access.

- [ ] **Step 3: Run focused integration checks**

Run: `pnpm --filter @classloom/db test`
Run: `pnpm --filter @classloom/api test`
Run: `pnpm --filter @classloom/api test:e2e`
Run: `pnpm --filter @classloom/web test`
Expected: all unit, tenant isolation, auth lifecycle, and web flow tests pass.

- [ ] **Step 4: Run repository quality gates**

Run: `pnpm lint`
Run: `pnpm typecheck`
Run: `pnpm build`
Expected: all workspace packages pass without committed secrets or generated local state.

- [ ] **Step 5: Review the complete diff and commit**

Run: `git diff --check`
Run: `git status --short`
Inspect migration SQL, security-sensitive logs, cookie/CORS configuration, `Set-Cookie` behavior, and whether any business endpoint was accidentally treated as authorized by authentication alone. Commit the verified implementation with scoped imperative commit subjects.
