# Identity and access

A login account is distinct from a student, guardian, or staff record. An account may have memberships in several tenants; a guardian may relate to several students. Portal accounts can be provisioned after domain records exist.

Phase 2 provides email/password accounts, Argon2id password hashes, and opaque revocable sessions stored server-side. The browser receives only a host-only HttpOnly SameSite=Lax cookie. Sessions expire after 12 hours idle or 7 days absolute by default, and are revoked on password reset, logout, account suspension, or membership suspension. Users with multiple active memberships choose a workspace; tenant context is resolved from the session's active membership.

Accounts can be created only through a trusted invitation flow. Send an invitation with `pnpm --filter @classloom/api auth:invite -- <tenant-id> <email>` while the API environment is configured; the recipient accepts the emailed link, creates a password, then signs in. Existing accounts must sign in before accepting a second workspace invitation. Do not add a public account or invitation-creation endpoint.

Password recovery uses single-use, one-hour tokens stored only as SHA-256 hashes. Reset request responses are the same for known and unknown email addresses. Login, invitation acceptance, and reset requests use temporary PostgreSQL-backed rate limits; email and source identifiers are HMAC-digested before persistence. SMTP is configured with `SMTP_*`; local development uses Mailpit at `http://localhost:8025`.

State-changing browser requests require the configured exact origin and `X-ClassLoom-Request: 1`. The web dashboard checks the server session and redirects unauthenticated requests to `/login`. Phase 3 adds explicit permissions with tenant, campus, academic, and relationship scopes. Authorization also checks workflow state, such as whether marks are still editable. Every sensitive API enforces authorization independently of UI visibility. Role/permission changes, attendance corrections, result publishing, payment adjustments, and exports generate audit records.
