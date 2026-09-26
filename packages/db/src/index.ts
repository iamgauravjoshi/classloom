export { createDb, checkDatabase } from './client.js';
export type { AppDb, TenantTransaction } from './client.js';
export { provisionTenant, ProvisioningConflictError } from './provisioning.js';
export type { ProvisionTenantInput } from './provisioning.js';
export {
  accountCredentials,
  accounts,
  academicClasses,
  academicSections,
  academicSessions,
  academicSubjects,
  academicTeacherAssignments,
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
  staffProfiles,
  staffSchoolAffiliations,
  teacherProfiles,
  tenants,
} from './schema.js';
export {
  StaffError,
  normalizeStaffCode,
  normalizeStaffProfile,
  normalizeStaffListFilters,
  createStaffProfile,
  listSchoolStaff,
  readSchoolStaff,
} from './staff.js';
export type { StaffScope, StaffProfileInput, StaffAffiliationInput, StaffCreateInput, StaffListFilters, StaffListPage, StaffRecord, StaffAudit } from './staff.js';
export { withTenantContext } from './tenant-context.js';
export { AcademicSetupError, validateAcademicCode, validateAcademicSession, listAcademicSchools, listActiveAcademicMembers, readAcademicSetup, createAcademicSession, createAcademicClass, createAcademicSection, createAcademicSubject, createAcademicAssignment, activateAcademicSession } from './academics.js';
export { withAccountContext } from './account-context.js';
export { seedTenantAuthorization } from './authorization-seeding.js';
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
export {
  canAccessScope,
  listMembershipAuthorizationGrants,
  createCustomRole,
  assignRole,
  revokeRoleAssignment,
  isAuthorizationScopeInTenant,
  listTenantAuthorizationAssignments,
  AuthorizationRepositoryError,
} from './authorization-repository.js';
export type { AuthorizationScope, AuthorizationGrant } from './authorization-repository.js';
export { listTenantAuthorizationRoles, bootstrapTenantAdmin } from './authorization-repository.js';
