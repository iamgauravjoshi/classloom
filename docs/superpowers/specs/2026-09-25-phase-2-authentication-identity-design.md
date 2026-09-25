# Phase 2: Authentication and identity

## Goal

Add first-party email and password authentication to ClassLoom, with global login accounts, tenant memberships, revocable server-side sessions, invitation-based onboarding, password recovery, and tenant resolution from an authenticated membership. This phase establishes identity and session authentication; it does not introduce authorization roles or permissions.

## Scope

Phase 2 includes:

- Global accounts and credentials, tenant-scoped memberships, invitation and password-reset records, database-backed sessions, and security event records.
- Argon2id password hashing and opaque random tokens whose hashes alone are persisted.
- Login, logout, current-session, membership listing and selection, invitation acceptance, and password reset flows.
- A trusted CLI/service operation to issue membership invitations; no public invitation-creation endpoint.
- SMTP email delivery through a provider-neutral adapter, with Mailpit for local development.
- Cookie, CSRF, rate-limit, session lifecycle, and tenant-resolution enforcement.
- Login, recovery, invitation, workspace selection, and protected-route behavior in the web app.
- Unit, PostgreSQL integration, and API end-to-end tests for identity lifecycle and tenant boundaries.

Phase 2 excludes public self-registration, admin-facing invitation management, role and permission authorization, MFA, student/guardian/staff portal provisioning, and business-domain endpoints. Phase 3 owns authorization roles, permissions, and administrative APIs. Authentication or active membership does not by itself grant access to business operations.

## Identity and data model

Accounts are global control-plane identities, distinct from student, guardian, and staff domain records. Domain records may be linked in a later phase. Account email is normalized consistently and unique case-insensitively. An account has a status (`active` or `suspended`) and timestamps; credentials store the Argon2id hash and password-change time separately from membership state.

The schema adds:

- `accounts`: UUID, normalized unique email, display name as available, status, timestamps.
- `account_credentials`: account UUID, password hash, password-updated timestamp; one credential row per password-enabled account.
- `memberships`: UUID, account UUID, tenant UUID, membership status (`active` or `suspended`), timestamps, and a unique account/tenant pair. Memberships are tenant-owned and use tenant-safe references and RLS. This phase does not assign roles.
- `sessions`: UUID, account UUID, SHA-256 hash of a 256-bit opaque token, optional active membership UUID, creation/last-seen/idle-expiry/absolute-expiry timestamps, and revocation timestamp. Enforce that a selected membership belongs to the session account, including on updates. Raw session tokens are never stored.
- `invitations`: UUID, tenant UUID, normalized invited email, token hash, expiry, creation/acceptance metadata, and invitation status. Acceptance creates or attaches the membership in the same transaction. A token can be accepted once.
- `password_reset_tokens`: UUID, account UUID, token hash, expiry, creation/consumption timestamps. A token can be consumed once.
- `security_events`: timestamped, minimal event type, account and/or tenant reference when known, request ID, and coarse source metadata needed for investigation. Never record passwords, raw session tokens, invitation tokens, or reset tokens.
- `auth_rate_limits`: shared PostgreSQL-backed counters or equivalent expiring records for login, invitation acceptance, and reset requests. Key counters with a keyed digest of normalized identity/source values where possible, and store only the minimum material needed to enforce the configured limits.

Exact SQL names and indexes may follow repository conventions. Unique constraints, foreign keys, expiry indexes, and tenant isolation are required. Account/session control-plane tables are accessed only by the API runtime through explicit repositories; tenant-owned membership and invitation operations establish tenant context using `withTenantContext` and the runtime role. The implementation must preserve the Phase 1 database role separation and forced RLS behavior.

## Password and token rules

Passwords use Argon2id with parameters chosen for the supported deployment and documented for future tuning. Password input permits passphrases, whitespace, paste, and all character classes; there are no composition rules. Require at least 15 characters for this password-only login, allow at least 64 characters, and set a documented upper bound sufficient for long passphrases while limiting hashing cost (for example 256 characters). Apply the same policy to invitation acceptance and password changes.

Session, invitation, and reset tokens are generated with a cryptographically secure random source. Session tokens contain 256 bits of entropy. Persist only SHA-256 token hashes and compare using constant-time-safe mechanisms where applicable. Invitation and reset tokens are single-use and expire. Password reset tokens expire after one hour; invitation lifetime is configurable with a documented default of seven days. Changing a password consumes the reset token and revokes every account session.

## Session and cookie behavior

The browser receives an opaque session token only in a host-only cookie with `HttpOnly`, `SameSite=Lax`, path `/`, and `Secure` in production. Local HTTP development may omit `Secure` only through an explicit non-production setting. The cookie has no broad `Domain` attribute. API calls from the web app include credentials, and CORS permits only the configured exact web origin with credentials enabled.

Sessions have a 12-hour idle timeout and a 7-day absolute lifetime. Activity may extend the idle expiry, never the absolute expiry. Logout revokes the current session and clears the cookie. Password reset and account suspension revoke all account sessions. Account status and active membership status are checked during authenticated request processing; suspending either immediately prevents use, even if a stale session row remains. Expired and revoked sessions are rejected and may be cleaned up asynchronously.

A newly authenticated account with one active membership may have that membership selected as part of login. An account with zero active memberships receives an authenticated session with no active tenant and a clear no-workspace state. An account with multiple memberships starts without an active tenant and is directed to workspace selection. The active membership is held in the server-side session. Selection accepts a membership identifier, verifies that it belongs to the authenticated account and is active, and then records it in that session. Tenant IDs, slugs, and tenant headers supplied by the caller never establish tenant context.

## Authentication and tenant request boundary

An API authentication guard resolves the cookie token by hash, checks session revocation and expiry, account status, and (when selected) membership ownership and status. It attaches a trusted account identity and optional active membership/tenant context to the request. Tenant-scoped repositories receive that validated tenant ID and use `withTenantContext`; they do not read tenant context from request parameters or headers.

This guard authenticates identity only. Phase 2 must not imply that an authenticated account can use future student, staff, finance, or academic endpoints. When such endpoints are added, Phase 3 authorization checks will be required independently of UI visibility and tenant isolation.

## API surface

Endpoints are versioned under `/api/v1` and use the existing response envelope:

- `POST /auth/login`: validate credentials, create a session, and set the cookie. Return a generic invalid-credentials error for unknown email and wrong password.
- `POST /auth/logout`: revoke the current session, clear the cookie, and return success idempotently.
- `GET /auth/session`: return the authenticated account, active membership if any, and active membership choices. Return unauthenticated when no valid session exists.
- `GET /auth/memberships`: return only the caller's active memberships.
- `POST /auth/membership`: validate and set the caller's active membership for this session.
- `POST /auth/invitations/accept`: accept a valid invitation and create a password/account when no account exists. If the email already belongs to an account, require that account to authenticate before adding the membership; do not let invitation possession take over an existing identity.
- `POST /auth/password-reset/request`: always return the same public response whether an account exists or not; issue and email a reset token only for an eligible account.
- `POST /auth/password-reset/confirm`: validate and consume the token, update the password, and revoke all sessions.

Invitation creation is a trusted CLI/service action and must not be exposed as an unauthenticated HTTP endpoint. It binds the invitation to a tenant and normalized email. Health and API documentation remain public. All other protected endpoints require a valid session; future business routes also require Phase 3 authorization.

State-changing browser requests use exact-Origin validation (with safe Referer fallback where needed) and a CSRF defense. SameSite cookies are defense in depth, not the sole CSRF control. Login, logout, membership selection, invitation acceptance, and reset confirmation are subject to CSRF checks where a browser cookie authenticates the request. Cross-origin requests are not allowed by CORS.

Validation errors may describe malformed input, but login and reset-request public responses must not reveal whether an email exists. Apply request-body size limits and throttling. Rate limits use shared database state so multiple API instances enforce the same policy. Throttling is temporary and does not permanently lock an account, preventing an attacker from causing lasting denial of service. Exact thresholds are configuration values with safe defaults documented in the implementation.

## Email and trusted onboarding

Define an email sender interface independent of a vendor. Local development uses Mailpit in Docker Compose; deployed environments configure SMTP host, port, TLS mode, username/password or equivalent credentials, and sender identity through environment variables. Secrets remain outside source control and `.env.example` contains safe placeholders only. Delivery failures do not expose tokens in logs or public API responses. Trusted invitation issuance records the invitation before sending, expires it on the configured schedule, and avoids duplicate active invitations for the same tenant/email.

Invitation acceptance verifies token hash, expiry, email binding, and current account state in one transaction. New accounts receive credentials and the invited active membership atomically. Existing accounts must first authenticate; the authenticated account email must match the invitation before the membership is attached. Replay and expired tokens fail without changing membership state. Invitation status is changed in the same transaction as membership creation so concurrent acceptance cannot create duplicate memberships or reuse the invitation.

## Web flows

Add the routes `/login`, `/forgot-password`, `/reset-password`, `/accept-invitation`, and `/select-workspace`. The existing dashboard route redirects unauthenticated users to login. After login, route accounts with multiple active memberships to workspace selection and accounts with one active membership to the dashboard. Accounts with no active membership see an explanatory empty state. Workspace selection displays only memberships returned by the authenticated API. The UI must not decide authorization; the API verifies session and membership on each request.

Forms provide accessible labels, inline validation, loading and error states, and generic messages for login and reset requests. Password inputs support paste and password managers. Cookies stay inaccessible to client-side JavaScript. Client requests to the API include credentials and use the configured API origin.

## Configuration and operations

Add validated configuration for session idle and absolute lifetime, cookie secure behavior, auth rate-limit settings, invitation/reset expiry, Argon2 parameters, SMTP, and exact web origin. Production must fail closed if credentials or cookie configuration are incomplete or insecure. Local defaults may support HTTP and Mailpit. Add migration and trusted invitation command documentation. Avoid printing secrets or raw bearer tokens in CLI output; for local trusted invitation issuance, provide a safe delivery path via email rather than writing the raw token into logs.

## Verification and acceptance criteria

### Unit and API tests

- Password hashing uses Argon2id; raw password is never persisted or logged. Verify correct and incorrect password checks and policy boundaries.
- Login rejects unknown email and incorrect password with indistinguishable public status/body shape; successful login sets the expected cookie attributes.
- Logout revokes only the current session and clears the cookie; expired, revoked, idle-expired, and absolutely expired sessions are rejected.
- Reset tokens are stored hashed, single-use, expire, and trigger revocation of all account sessions.
- Invitation acceptance creates account, credential, and membership atomically; existing-account invitation requires authentication; expired and replayed invitations fail.
- Suspended accounts and memberships lose access immediately; membership selection rejects another account's membership.
- CSRF origin checks reject untrusted origins. Shared rate limiting throttles repeated attempts without permanent lockout.
- Security events omit secrets and include a request ID where available.

### PostgreSQL tenant integration tests

Using a non-superuser runtime role, verify that an account cannot enumerate or select another account's membership, invitations cannot attach a user to a different tenant, membership queries use tenant context and obey RLS, missing tenant context does not expose tenant-owned rows, and pooled transactions do not leak tenant context. Verify transaction rollback prevents partially created account/membership/credential state. Include two tenants and known identifiers to test direct-ID access attempts.

### End-to-end and repository checks

API E2E tests cover login, authenticated session lookup, workspace selection, logout, invitation acceptance, password reset, CSRF rejection, throttling, and protected route behavior. Web tests cover redirects and each form's loading, success, and error states. Run relevant package tests, PostgreSQL integration tests, lint, typecheck, build, and database migration checks. Tests that need PostgreSQL must exercise the configured runtime role without superuser or `BYPASSRLS` privileges.

Acceptance requires all flows above to work without caller-controlled tenant context, production cookies to be secure, secrets and raw tokens to remain out of persistence/logs, session invalidation to apply promptly, and documentation to describe local SMTP, invitation issuance, and configuration.

## Decisions and references

- First-party email/password and server-side sessions are selected for Phase 2.
- Argon2id is selected for password storage. See [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Reset response uniformity and single-use expiring tokens follow [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).
- Opaque random server-side sessions and secure cookie properties follow [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).
- CSRF uses origin checks and an explicit mitigation in addition to SameSite; see [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
- Password policy follows [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): minimum 15 for single-factor passwords, support at least 64 characters, permit paste, and do not impose composition rules.
- Nest request throttling guidance: [NestJS rate limiting](https://docs.nestjs.com/security/rate-limiting).
- Web cookie handling references the installed Next.js guidance: [Authentication](https://nextjs.org/docs/app/guides/authentication) and [cookies API](https://nextjs.org/docs/app/api-reference/functions/cookies).

## Alternatives considered

1. **External identity provider now.** Rejected for this phase because first-party email/password was explicitly selected and adds no external account dependency.
2. **Store session identity in a signed client token.** Rejected because immediate revocation, account suspension, membership suspension, and password reset invalidation require server-side session state.
3. **Accept a tenant ID from the web client.** Rejected because a caller could choose an unauthorized tenant. Only a validated account membership can set session tenant context.
4. **Expose invitation creation before authorization exists.** Rejected because it would create an unauthenticated tenant administration surface. Phase 2 issues invitations through a trusted CLI/service capability.
5. **Permanently lock an account after repeated failures.** Rejected because attackers could intentionally deny service to known users; use shared temporary throttling instead.
