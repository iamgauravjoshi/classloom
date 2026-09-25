export { createDb, checkDatabase } from './client.js';
export type { AppDb, TenantTransaction } from './client.js';
export { provisionTenant, ProvisioningConflictError } from './provisioning.js';
export type { ProvisionTenantInput } from './provisioning.js';
export {
  accountCredentials,
  accounts,
  appMetadata,
  authRateLimits,
  campuses,
  invitations,
  memberships,
  passwordResetTokens,
  schools,
  securityEvents,
  sessions,
  tenants,
} from './schema.js';
export { withTenantContext } from './tenant-context.js';
export { withAccountContext } from './account-context.js';
export {
  createAccountWithMembership,
  createSession,
  findAccountCredentialByEmail,
  getSessionByTokenHash,
  listActiveMemberships,
  normalizeEmailAddress,
  revokeSession,
  revokeSessionsForAccount,
  selectSessionMembership,
  touchSession,
} from './identity-repository.js';
