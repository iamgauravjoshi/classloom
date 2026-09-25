export { createDb, checkDatabase } from './client.js';
export type { AppDb, TenantTransaction } from './client.js';
export { provisionTenant, ProvisioningConflictError } from './provisioning.js';
export type { ProvisionTenantInput } from './provisioning.js';
export {
  accountCredentials,
  accounts,
  authorizationRolePermissions,
  authorizationRoles,
  appMetadata,
  authRateLimits,
  campuses,
  invitations,
  memberships,
  membershipRoleAssignments,
  permissions,
  passwordResetTokens,
  schools,
  securityEvents,
  sessions,
  tenants,
} from './schema.js';
export { withTenantContext } from './tenant-context.js';
export { withAccountContext } from './account-context.js';
export { PERMISSION_CATALOG, BUILT_IN_ROLE_TEMPLATES } from './authorization-catalog.js';
export type { PermissionKey, AuthorizationScopeKind } from './authorization-catalog.js';
export {
  createAccountWithMembership,
  createPasswordResetToken,
  isPasswordResetTokenValid,
  consumePasswordResetToken,
  consumeAuthRateLimit,
  checkAuthRateLimit,
  recordSecurityEvent,
  createSession,
  createSessionIfPasswordHashUnchanged,
  findAccountCredentialByEmail,
  getSessionByTokenHash,
  listActiveMemberships,
  normalizeEmailAddress,
  revokeSession,
  revokeSessionsForAccount,
  selectSessionMembership,
  touchSession,
} from './identity-repository.js';
export {
  createMembershipInvitation,
  revokeMembershipInvitation,
  acceptInvitationForExistingAccount,
  acceptInvitationForNewAccount,
  InvitationError,
} from './invite-membership.js';
