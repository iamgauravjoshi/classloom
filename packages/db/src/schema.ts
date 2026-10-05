import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  boolean,
  bigint,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  pgPolicy,
  serial,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const appMetadata = pgTable('app_metadata', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('app_metadata_key_unique').on(table.key)]);

export const tenants = pgTable('tenants', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('tenants_slug_unique').on(table.slug)]);

export const schools = pgTable('schools', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  code: text('code').notNull(),
  timezone: text('timezone').notNull(),
  currency: text('currency').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('schools_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('schools_tenant_code_unique').on(table.tenantId, table.code),
  pgPolicy('schools_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
]).enableRLS();

export const campuses = pgTable('campuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  addressLine1: text('address_line_1'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  countryCode: text('country_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.tenantId, table.schoolId],
    foreignColumns: [schools.tenantId, schools.id],
    name: 'campuses_tenant_school_fk',
  }).onDelete('cascade'),
  uniqueIndex('campuses_tenant_school_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('campuses_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('campuses_school_code_unique').on(table.tenantId, table.schoolId, table.code),
  pgPolicy('campuses_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
]).enableRLS();

export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  normalizedEmail: text('normalized_email').notNull(),
  displayName: text('display_name'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('accounts_normalized_email_unique').on(table.normalizedEmail)]);

export const accountCredentials = pgTable('account_credentials', {
  accountId: uuid('account_id').primaryKey().references(() => accounts.id, { onDelete: 'cascade' }),
  passwordHash: text('password_hash').notNull(),
  passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('memberships_account_tenant_unique').on(table.accountId, table.tenantId),
  uniqueIndex('memberships_account_id_id_unique').on(table.accountId, table.id),
  uniqueIndex('memberships_tenant_id_id_unique').on(table.tenantId, table.id),
  pgPolicy('memberships_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
  pgPolicy('memberships_account_read', {
    for: 'select',
    to: 'public',
    using: sql`account_id = nullif(current_setting('app.account_id', true), '')::uuid`,
  }),
]).enableRLS();

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  activeMembershipId: uuid('active_membership_id'),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [
  foreignKey({
    columns: [table.accountId, table.activeMembershipId],
    foreignColumns: [memberships.accountId, memberships.id],
    name: 'sessions_account_membership_fk',
  }).onDelete('cascade'),
  uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
  uniqueIndex('sessions_account_id_id_unique').on(table.accountId, table.id),
  index('sessions_account_active_idx').on(table.accountId, table.revokedAt),
  index('sessions_expiry_idx').on(table.idleExpiresAt, table.absoluteExpiresAt),
]);

export const invitations = pgTable('invitations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  normalizedEmail: text('normalized_email').notNull(),
  tokenHash: text('token_hash').notNull(),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('invitations_token_hash_unique').on(table.tokenHash),
  uniqueIndex('invitations_pending_tenant_email_unique')
    .on(table.tenantId, table.normalizedEmail)
    .where(sql`status = 'pending'`),
  index('invitations_expiry_idx').on(table.expiresAt),
  pgPolicy('invitations_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
  pgPolicy('invitations_token_lookup', {
    for: 'select',
    to: 'public',
    using: sql`token_hash = current_setting('app.invitation_token_hash', true)`,
  }),
  pgPolicy('invitations_token_update', {
    for: 'update',
    to: 'public',
    using: sql`token_hash = current_setting('app.invitation_token_hash', true)`,
    withCheck: sql`token_hash = current_setting('app.invitation_token_hash', true)`,
  }),
]).enableRLS();

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('password_reset_tokens_hash_unique').on(table.tokenHash),
  index('password_reset_tokens_account_consumed_idx').on(table.accountId, table.consumedAt),
  index('password_reset_tokens_expiry_idx').on(table.expiresAt),
]);

export const securityEvents = pgTable('security_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: text('event_type').notNull(),
  accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  requestId: text('request_id'),
  sourceDigest: text('source_digest'),
  metadata: jsonb('metadata').$type<Record<string, string | number | boolean | null>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('security_events_created_id_idx').on(table.createdAt, table.id),
]);

export const authRateLimits = pgTable('auth_rate_limits', {
  id: uuid('id').defaultRandom().primaryKey(),
  scope: text('scope').notNull(),
  subjectDigest: text('subject_digest').notNull(),
  attempts: integer('attempts').notNull().default(0),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('auth_rate_limits_scope_subject_unique').on(table.scope, table.subjectDigest),
  index('auth_rate_limits_window_idx').on(table.blockedUntil, table.windowStartedAt),
]);

export const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
  family: text('family').notNull(),
  scopeKind: text('scope_kind').notNull(),
  action: text('action').notNull(),
  readOnly: boolean('read_only').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authorizationRoles = pgTable('authorization_roles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  systemKey: text('system_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('authorization_roles_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('authorization_roles_tenant_key_unique').on(table.tenantId, table.key),
  uniqueIndex('authorization_roles_tenant_system_key_unique')
    .on(table.tenantId, table.systemKey)
    .where(sql`${table.systemKey} is not null`),
  pgPolicy('authorization_roles_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
]).enableRLS();

export const authorizationRolePermissions = pgTable('authorization_role_permissions', {
  tenantId: uuid('tenant_id').notNull(),
  roleId: uuid('role_id').notNull(),
  permissionKey: text('permission_key').notNull().references(() => permissions.key, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('authorization_role_permissions_unique').on(table.tenantId, table.roleId, table.permissionKey),
  foreignKey({
    columns: [table.tenantId, table.roleId],
    foreignColumns: [authorizationRoles.tenantId, authorizationRoles.id],
    name: 'authorization_role_permissions_tenant_role_fk',
  }).onDelete('cascade'),
  pgPolicy('authorization_role_permissions_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
]).enableRLS();

export const membershipRoleAssignments = pgTable('membership_role_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  roleId: uuid('role_id').notNull(),
  scopeKind: text('scope_kind').notNull(),
  schoolId: uuid('school_id'),
  campusId: uuid('campus_id'),
  createdByAccountId: uuid('created_by_account_id').references(() => accounts.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique('membership_role_assignments_grant_unique')
    .on(table.tenantId, table.membershipId, table.roleId, table.scopeKind, table.schoolId, table.campusId)
    .nullsNotDistinct(),
  index('membership_role_assignments_membership_idx').on(table.tenantId, table.membershipId),
  foreignKey({
    columns: [table.tenantId, table.membershipId],
    foreignColumns: [memberships.tenantId, memberships.id],
    name: 'membership_role_assignments_tenant_membership_fk',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.tenantId, table.roleId],
    foreignColumns: [authorizationRoles.tenantId, authorizationRoles.id],
    name: 'membership_role_assignments_tenant_role_fk',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.tenantId, table.schoolId],
    foreignColumns: [schools.tenantId, schools.id],
    name: 'membership_role_assignments_tenant_school_fk',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.tenantId, table.schoolId, table.campusId],
    foreignColumns: [campuses.tenantId, campuses.schoolId, campuses.id],
    name: 'membership_role_assignments_tenant_campus_fk',
  }).onDelete('cascade'),
  check('membership_role_assignments_scope_shape_check', sql`
    (scope_kind = 'tenant' and school_id is null and campus_id is null)
    or (scope_kind = 'school' and school_id is not null and campus_id is null)
    or (scope_kind = 'campus' and school_id is not null and campus_id is not null)
  `),
  pgPolicy('membership_role_assignments_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
]).enableRLS();

const tenantPolicy = (table: { tenantId: import('drizzle-orm/pg-core').PgColumn }) => pgPolicy('tenant_isolation', {
  for: 'all', to: 'public',
  using: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${table.tenantId} = nullif(current_setting('app.tenant_id', true), '')::uuid`,
});

export const staffProfiles = pgTable('staff_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  staffCode: text('staff_code').notNull(),
  givenName: text('given_name').notNull(),
  familyName: text('family_name').notNull(),
  preferredName: text('preferred_name'),
  workEmail: text('work_email'),
  phone: text('phone'),
  membershipId: uuid('membership_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.membershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'staff_profiles_tenant_membership_fk' }).onDelete('restrict'),
  uniqueIndex('staff_profiles_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('staff_profiles_tenant_code_unique').on(table.tenantId, sql`upper(trim(${table.staffCode}))`),
  uniqueIndex('staff_profiles_tenant_membership_unique').on(table.tenantId, table.membershipId).where(sql`${table.membershipId} is not null`),
  tenantPolicy(table),
]).enableRLS();

export const staffSchoolAffiliations = pgTable('staff_school_affiliations', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  staffId: uuid('staff_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  designation: text('designation').notNull(),
  startDate: date('start_date'),
  kind: text('kind').notNull().default('staff'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.staffId], foreignColumns: [staffProfiles.tenantId, staffProfiles.id], name: 'staff_affiliations_tenant_staff_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'staff_affiliations_tenant_school_fk' }).onDelete('cascade'),
  uniqueIndex('staff_affiliations_tenant_staff_school_unique').on(table.tenantId, table.staffId, table.schoolId),
  index('staff_affiliations_school_status_idx').on(table.tenantId, table.schoolId, table.status),
  check('staff_affiliations_kind_check', sql`${table.kind} in ('staff', 'teacher')`),
  check('staff_affiliations_status_check', sql`${table.status} in ('active', 'inactive')`),
  tenantPolicy(table),
]).enableRLS();

export const teacherProfiles = pgTable('teacher_profiles', {
  staffId: uuid('staff_id').primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  qualification: text('qualification'),
  specialization: text('specialization'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.staffId], foreignColumns: [staffProfiles.tenantId, staffProfiles.id], name: 'teacher_profiles_tenant_staff_fk' }).onDelete('cascade'),
  tenantPolicy(table),
]).enableRLS();

export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  studentCode: text('student_code').notNull(),
  givenName: text('given_name').notNull(),
  middleName: text('middle_name'),
  familyName: text('family_name').notNull(),
  preferredName: text('preferred_name'),
  dateOfBirth: date('date_of_birth').notNull(),
  gender: text('gender'),
  email: text('email'),
  phone: text('phone'),
  status: text('status').notNull().default('active'),
  membershipId: uuid('membership_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.membershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'student_profiles_tenant_membership_fk' }).onDelete('restrict'),
  unique('student_profiles_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('student_profiles_tenant_code_unique').on(table.tenantId, sql`upper(trim(${table.studentCode}))`),
  uniqueIndex('student_profiles_tenant_membership_unique').on(table.tenantId, table.membershipId).where(sql`${table.membershipId} is not null`),
  check('student_profiles_status_check', sql`${table.status} in ('active', 'inactive')`),
  tenantPolicy(table),
]).enableRLS();

export const guardianProfiles = pgTable('guardian_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  guardianCode: text('guardian_code').notNull(),
  givenName: text('given_name').notNull(),
  middleName: text('middle_name'),
  familyName: text('family_name').notNull(),
  preferredName: text('preferred_name'),
  email: text('email'),
  phone: text('phone'),
  occupation: text('occupation'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  countryCode: text('country_code'),
  status: text('status').notNull().default('active'),
  membershipId: uuid('membership_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.membershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'guardian_profiles_tenant_membership_fk' }).onDelete('restrict'),
  unique('guardian_profiles_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('guardian_profiles_tenant_code_unique').on(table.tenantId, sql`upper(trim(${table.guardianCode}))`),
  uniqueIndex('guardian_profiles_tenant_membership_unique').on(table.tenantId, table.membershipId).where(sql`${table.membershipId} is not null`),
  check('guardian_profiles_status_check', sql`${table.status} in ('active', 'inactive')`),
  tenantPolicy(table),
]).enableRLS();

export const studentGuardianRelationships = pgTable('student_guardian_relationships', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  studentId: uuid('student_id').notNull(),
  guardianId: uuid('guardian_id').notNull(),
  relationshipType: text('relationship_type').notNull(),
  primaryContact: boolean('primary_contact').notNull().default(false),
  emergencyContact: boolean('emergency_contact').notNull().default(false),
  authorizedPickup: boolean('authorized_pickup').notNull().default(false),
  financialResponsibility: boolean('financial_responsibility').notNull().default(false),
  portalAccess: boolean('portal_access').notNull().default(false),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.studentId], foreignColumns: [studentProfiles.tenantId, studentProfiles.id], name: 'student_guardian_relationships_student_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.guardianId], foreignColumns: [guardianProfiles.tenantId, guardianProfiles.id], name: 'student_guardian_relationships_guardian_fk' }).onDelete('cascade'),
  uniqueIndex('student_guardian_relationships_tenant_id_id_unique').on(table.tenantId, table.id),
  uniqueIndex('student_guardian_relationships_pair_unique').on(table.tenantId, table.studentId, table.guardianId),
  index('student_guardian_relationships_guardian_status_idx').on(table.tenantId, table.guardianId, table.status),
  check('student_guardian_relationships_type_check', sql`${table.relationshipType} in ('mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other')`),
  check('student_guardian_relationships_status_check', sql`${table.status} in ('active', 'inactive')`),
  tenantPolicy(table),
]).enableRLS();

export const studentSchoolEnrollments = pgTable('student_school_enrollments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(),
  admissionNumber: text('admission_number').notNull(),
  admissionDate: date('admission_date').notNull(),
  leavingDate: date('leaving_date'),
  leavingReason: text('leaving_reason'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'student_school_enrollments_school_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.studentId], foreignColumns: [studentProfiles.tenantId, studentProfiles.id], name: 'student_school_enrollments_student_fk' }).onDelete('restrict'),
  uniqueIndex('student_school_enrollments_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('student_school_enrollments_student_scope_id_unique').on(table.tenantId, table.schoolId, table.studentId, table.id),
  uniqueIndex('student_school_enrollments_admission_unique').on(table.tenantId, table.schoolId, sql`upper(trim(${table.admissionNumber}))`),
  uniqueIndex('student_school_enrollments_one_active_unique').on(table.tenantId, table.schoolId, table.studentId).where(sql`${table.status} = 'active'`),
  index('student_school_enrollments_school_status_idx').on(table.tenantId, table.schoolId, table.status),
  check('student_school_enrollments_status_check', sql`${table.status} in ('active', 'withdrawn', 'transferred', 'completed')`),
  check('student_school_enrollments_dates_check', sql`${table.leavingDate} is null or ${table.leavingDate} >= ${table.admissionDate}`),
  tenantPolicy(table),
]).enableRLS();

export const studentImportBatches = pgTable('student_import_batches', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  actorAccountId: uuid('actor_account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  idempotencyKey: text('idempotency_key').notNull(),
  payloadChecksum: text('payload_checksum').notNull(),
  status: text('status').notNull().default('processing'),
  studentCount: integer('student_count').notNull().default(0),
  guardianCount: integer('guardian_count').notNull().default(0),
  enrollmentCount: integer('enrollment_count').notNull().default(0),
  failureCategory: text('failure_category'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'student_import_batches_school_fk' }).onDelete('restrict'),
  uniqueIndex('student_import_batches_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('student_import_batches_idempotency_unique').on(table.tenantId, table.schoolId, table.idempotencyKey),
  check('student_import_batches_status_check', sql`${table.status} in ('processing', 'completed', 'failed')`),
  check('student_import_batches_checksum_check', sql`length(${table.payloadChecksum}) = 64`),
  tenantPolicy(table),
]).enableRLS();

export const academicSessions = pgTable('academic_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'academic_sessions_school_fk' }).onDelete('cascade'),
  uniqueIndex('academic_sessions_tenant_school_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('academic_sessions_school_code_unique').on(table.tenantId, table.schoolId, table.code),
  uniqueIndex('academic_sessions_one_active_unique').on(table.tenantId, table.schoolId).where(sql`${table.status} = 'active'`),
  check('academic_sessions_dates_check', sql`${table.endDate} > ${table.startDate}`),
  check('academic_sessions_status_check', sql`${table.status} in ('draft', 'active', 'archived')`),
  tenantPolicy(table),
]).enableRLS();

export const academicClasses = pgTable('academic_classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId], foreignColumns: [academicSessions.tenantId, academicSessions.schoolId, academicSessions.id], name: 'academic_classes_session_fk' }).onDelete('cascade'),
  uniqueIndex('academic_classes_scope_id_unique').on(table.tenantId, table.schoolId, table.sessionId, table.id),
  uniqueIndex('academic_classes_session_code_unique').on(table.tenantId, table.schoolId, table.sessionId, table.code),
  tenantPolicy(table),
]).enableRLS();

export const academicSections = pgTable('academic_sections', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  classId: uuid('class_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  capacity: integer('capacity'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.classId], foreignColumns: [academicClasses.tenantId, academicClasses.schoolId, academicClasses.sessionId, academicClasses.id], name: 'academic_sections_class_fk' }).onDelete('cascade'),
  uniqueIndex('academic_sections_scope_id_unique').on(table.tenantId, table.schoolId, table.sessionId, table.id),
  unique('academic_sections_scope_class_id_unique').on(table.tenantId, table.schoolId, table.sessionId, table.classId, table.id),
  uniqueIndex('academic_sections_class_code_unique').on(table.tenantId, table.schoolId, table.sessionId, table.classId, table.code),
  check('academic_sections_capacity_check', sql`${table.capacity} is null or ${table.capacity} > 0`),
  tenantPolicy(table),
]).enableRLS();

export const academicSubjects = pgTable('academic_subjects', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  name: text('name').notNull(),
  code: text('code').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId], foreignColumns: [academicSessions.tenantId, academicSessions.schoolId, academicSessions.id], name: 'academic_subjects_session_fk' }).onDelete('cascade'),
  uniqueIndex('academic_subjects_scope_id_unique').on(table.tenantId, table.schoolId, table.sessionId, table.id),
  uniqueIndex('academic_subjects_session_code_unique').on(table.tenantId, table.schoolId, table.sessionId, table.code),
  tenantPolicy(table),
]).enableRLS();

export const academicTeacherAssignments = pgTable('academic_teacher_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  sectionId: uuid('section_id').notNull(),
  subjectId: uuid('subject_id').notNull(),
  membershipId: uuid('membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.sectionId], foreignColumns: [academicSections.tenantId, academicSections.schoolId, academicSections.sessionId, academicSections.id], name: 'academic_assignments_section_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.subjectId], foreignColumns: [academicSubjects.tenantId, academicSubjects.schoolId, academicSubjects.sessionId, academicSubjects.id], name: 'academic_assignments_subject_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.membershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'academic_assignments_membership_fk' }).onDelete('cascade'),
  uniqueIndex('academic_assignments_section_subject_unique').on(table.tenantId, table.schoolId, table.sessionId, table.sectionId, table.subjectId),
  unique('academic_assignments_scope_id_unique').on(table.tenantId, table.schoolId, table.sessionId, table.id),
  tenantPolicy(table),
]).enableRLS();

export const studentAcademicEnrollments = pgTable('student_academic_enrollments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  studentId: uuid('student_id').notNull(),
  schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  classId: uuid('class_id').notNull(),
  sectionId: uuid('section_id').notNull(),
  rollNumber: text('roll_number'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  reason: text('reason'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.studentId, table.schoolEnrollmentId], foreignColumns: [studentSchoolEnrollments.tenantId, studentSchoolEnrollments.schoolId, studentSchoolEnrollments.studentId, studentSchoolEnrollments.id], name: 'student_academic_enrollments_school_enrollment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.classId, table.sectionId], foreignColumns: [academicSections.tenantId, academicSections.schoolId, academicSections.sessionId, academicSections.classId, academicSections.id], name: 'student_academic_enrollments_section_fk' }).onDelete('restrict'),
  uniqueIndex('student_academic_enrollments_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('student_academic_enrollments_one_active_unique').on(table.tenantId, table.schoolId, table.studentId, table.sessionId).where(sql`${table.status} = 'active'`),
  uniqueIndex('student_academic_enrollments_active_roll_unique').on(table.tenantId, table.schoolId, table.sessionId, table.sectionId, sql`upper(trim(${table.rollNumber}))`).where(sql`${table.status} = 'active' and ${table.rollNumber} is not null`),
  index('student_academic_enrollments_student_history_idx').on(table.tenantId, table.schoolId, table.studentId, table.startDate),
  check('student_academic_enrollments_status_check', sql`${table.status} in ('active', 'transferred', 'withdrawn', 'completed')`),
  check('student_academic_enrollments_dates_check', sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`),
  tenantPolicy(table),
]).enableRLS();

export const admissionCases = pgTable('admission_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  caseReference: text('case_reference').notNull(),
  status: text('status').notNull().default('enquiry'),
  studentGivenName: text('student_given_name'),
  studentMiddleName: text('student_middle_name'),
  studentFamilyName: text('student_family_name'),
  studentPreferredName: text('student_preferred_name'),
  studentDateOfBirth: date('student_date_of_birth'),
  studentGender: text('student_gender'),
  studentEmail: text('student_email'),
  studentPhone: text('student_phone'),
  existingStudentId: uuid('existing_student_id'),
  requestedSessionId: uuid('requested_session_id'),
  requestedClassId: uuid('requested_class_id'),
  requestedSectionId: uuid('requested_section_id'),
  reviewNote: text('review_note'),
  decisionNote: text('decision_note'),
  convertedStudentId: uuid('converted_student_id'),
  convertedSchoolEnrollmentId: uuid('converted_school_enrollment_id'),
  convertedAcademicEnrollmentId: uuid('converted_academic_enrollment_id'),
  createdByAccountId: uuid('created_by_account_id').notNull(),
  createdByMembershipId: uuid('created_by_membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'admission_cases_school_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.existingStudentId], foreignColumns: [studentProfiles.tenantId, studentProfiles.id], name: 'admission_cases_existing_student_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.convertedStudentId], foreignColumns: [studentProfiles.tenantId, studentProfiles.id], name: 'admission_cases_converted_student_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.convertedSchoolEnrollmentId], foreignColumns: [studentSchoolEnrollments.tenantId, studentSchoolEnrollments.schoolId, studentSchoolEnrollments.id], name: 'admission_cases_converted_school_enrollment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.convertedAcademicEnrollmentId], foreignColumns: [studentAcademicEnrollments.tenantId, studentAcademicEnrollments.schoolId, studentAcademicEnrollments.id], name: 'admission_cases_converted_academic_enrollment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.createdByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'admission_cases_created_by_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.createdByAccountId, table.createdByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'admission_cases_created_by_account_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.createdByAccountId], foreignColumns: [accounts.id], name: 'admission_cases_created_by_account_fk' }).onDelete('restrict'),
  unique('admission_cases_tenant_school_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('admission_cases_school_reference_unique').on(table.tenantId, table.schoolId, sql`upper(trim(${table.caseReference}))`),
  index('admission_cases_school_status_created_idx').on(table.tenantId, table.schoolId, table.status, table.createdAt, table.id),
  check('admission_cases_status_check', sql`${table.status} in ('enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted')`),
  tenantPolicy(table),
]).enableRLS();

export const admissionCaseGuardians = pgTable('admission_case_guardians', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  caseId: uuid('case_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  guardianProfileId: uuid('guardian_profile_id'),
  guardianCode: text('guardian_code'),
  givenName: text('given_name').notNull(),
  middleName: text('middle_name'),
  familyName: text('family_name').notNull(),
  preferredName: text('preferred_name'),
  email: text('email'),
  phone: text('phone'),
  occupation: text('occupation'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  city: text('city'),
  state: text('state'),
  postalCode: text('postal_code'),
  countryCode: text('country_code'),
  relationshipType: text('relationship_type').notNull(),
  primaryContact: boolean('primary_contact').notNull().default(false),
  emergencyContact: boolean('emergency_contact').notNull().default(false),
  authorizedPickup: boolean('authorized_pickup').notNull().default(false),
  financialResponsibility: boolean('financial_responsibility').notNull().default(false),
  portalAccess: boolean('portal_access').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.caseId], foreignColumns: [admissionCases.tenantId, admissionCases.schoolId, admissionCases.id], name: 'admission_case_guardians_case_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.guardianProfileId], foreignColumns: [guardianProfiles.tenantId, guardianProfiles.id], name: 'admission_case_guardians_guardian_fk' }).onDelete('restrict'),
  uniqueIndex('admission_case_guardians_tenant_school_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('admission_case_guardians_case_ordinal_unique').on(table.tenantId, table.schoolId, table.caseId, table.ordinal),
  check('admission_case_guardians_ordinal_check', sql`${table.ordinal} between 1 and 10`),
  check('admission_case_guardians_relationship_type_check', sql`${table.relationshipType} in ('mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other')`),
  tenantPolicy(table),
]).enableRLS();

export const admissionCaseEvents = pgTable('admission_case_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  caseId: uuid('case_id').notNull(),
  actorAccountId: uuid('actor_account_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(),
  eventType: text('event_type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.caseId], foreignColumns: [admissionCases.tenantId, admissionCases.schoolId, admissionCases.id], name: 'admission_case_events_case_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.actorMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'admission_case_events_actor_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.actorAccountId, table.actorMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'admission_case_events_actor_account_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.actorAccountId], foreignColumns: [accounts.id], name: 'admission_case_events_actor_account_fk' }).onDelete('restrict'),
  uniqueIndex('admission_case_events_tenant_school_id_unique').on(table.tenantId, table.schoolId, table.id),
  index('admission_case_events_case_created_idx').on(table.tenantId, table.schoolId, table.caseId, table.createdAt, table.id),
  check('admission_case_events_to_status_check', sql`${table.toStatus} in ('enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted')`),
  check('admission_case_events_from_status_check', sql`${table.fromStatus} is null or ${table.fromStatus} in ('enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted')`),
  tenantPolicy(table),
]).enableRLS();

export const weeklyTimetables = pgTable('weekly_timetables', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  status: text('status').notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdByAccountId: uuid('created_by_account_id').notNull(),
  createdByMembershipId: uuid('created_by_membership_id').notNull(),
  updatedByAccountId: uuid('updated_by_account_id').notNull(),
  updatedByMembershipId: uuid('updated_by_membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'weekly_timetables_school_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId], foreignColumns: [academicSessions.tenantId, academicSessions.schoolId, academicSessions.id], name: 'weekly_timetables_session_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.createdByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'weekly_timetables_created_by_tenant_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.updatedByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'weekly_timetables_updated_by_tenant_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.createdByAccountId, table.createdByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'weekly_timetables_created_by_actor_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.updatedByAccountId, table.updatedByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'weekly_timetables_updated_by_actor_fk' }).onDelete('restrict'),
  unique('weekly_timetables_tenant_school_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('weekly_timetables_scope_session_id_unique').on(table.tenantId, table.schoolId, table.sessionId, table.id),
  uniqueIndex('weekly_timetables_session_unique').on(table.tenantId, table.schoolId, table.sessionId),
  check('weekly_timetables_status_check', sql`${table.status} in ('draft', 'published')`),
  tenantPolicy(table),
]).enableRLS();

export const weeklyTimetableSlots = pgTable('weekly_timetable_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  timetableId: uuid('timetable_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  sectionId: uuid('section_id').notNull(),
  subjectId: uuid('subject_id').notNull(),
  teacherAssignmentId: uuid('teacher_assignment_id'),
  weekday: integer('weekday').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  roomLabel: text('room_label'),
  demoKey: text('demo_key'),
  createdByAccountId: uuid('created_by_account_id').notNull(),
  createdByMembershipId: uuid('created_by_membership_id').notNull(),
  updatedByAccountId: uuid('updated_by_account_id').notNull(),
  updatedByMembershipId: uuid('updated_by_membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.timetableId], foreignColumns: [weeklyTimetables.tenantId, weeklyTimetables.schoolId, weeklyTimetables.sessionId, weeklyTimetables.id], name: 'weekly_timetable_slots_parent_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.sectionId], foreignColumns: [academicSections.tenantId, academicSections.schoolId, academicSections.sessionId, academicSections.id], name: 'weekly_timetable_slots_section_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.subjectId], foreignColumns: [academicSubjects.tenantId, academicSubjects.schoolId, academicSubjects.sessionId, academicSubjects.id], name: 'weekly_timetable_slots_subject_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.teacherAssignmentId], foreignColumns: [academicTeacherAssignments.tenantId, academicTeacherAssignments.schoolId, academicTeacherAssignments.sessionId, academicTeacherAssignments.id], name: 'weekly_timetable_slots_teacher_assignment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.createdByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'weekly_timetable_slots_created_by_tenant_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.updatedByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'weekly_timetable_slots_updated_by_tenant_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.createdByAccountId, table.createdByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'weekly_timetable_slots_created_by_actor_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.updatedByAccountId, table.updatedByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'weekly_timetable_slots_updated_by_actor_fk' }).onDelete('restrict'),
  uniqueIndex('weekly_timetable_slots_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('weekly_timetable_slots_demo_key_unique').on(table.tenantId, table.schoolId, table.sessionId, sql`upper(trim(${table.demoKey}))`).where(sql`${table.demoKey} is not null`),
  index('weekly_timetable_slots_section_day_time_idx').on(table.tenantId, table.schoolId, table.sessionId, table.sectionId, table.weekday, table.startTime),
  check('weekly_timetable_slots_weekday_check', sql`${table.weekday} between 1 and 7`),
  check('weekly_timetable_slots_time_check', sql`${table.startTime} < ${table.endTime}`),
  tenantPolicy(table),
]).enableRLS();

export const weeklyTimetableEvents = pgTable('weekly_timetable_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  timetableId: uuid('timetable_id').notNull(),
  slotId: uuid('slot_id'),
  actorAccountId: uuid('actor_account_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(),
  eventType: text('event_type').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.timetableId], foreignColumns: [weeklyTimetables.tenantId, weeklyTimetables.schoolId, weeklyTimetables.id], name: 'weekly_timetable_events_timetable_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.actorMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'weekly_timetable_events_actor_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.actorAccountId, table.actorMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'weekly_timetable_events_actor_account_membership_fk' }).onDelete('restrict'),
  uniqueIndex('weekly_timetable_events_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  index('weekly_timetable_events_timetable_created_idx').on(table.tenantId, table.schoolId, table.timetableId, table.createdAt, table.id),
  check('weekly_timetable_events_type_check', sql`${table.eventType} in ('created', 'slot_created', 'slot_updated', 'slot_deleted', 'published')`),
  tenantPolicy(table),
]).enableRLS();

export const dailyAttendanceRegisters = pgTable('daily_attendance_registers', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  sectionId: uuid('section_id').notNull(),
  attendanceDate: date('attendance_date').notNull(),
  createdByAccountId: uuid('created_by_account_id').notNull(),
  createdByMembershipId: uuid('created_by_membership_id').notNull(),
  updatedByAccountId: uuid('updated_by_account_id').notNull(),
  updatedByMembershipId: uuid('updated_by_membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'daily_attendance_registers_school_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId], foreignColumns: [academicSessions.tenantId, academicSessions.schoolId, academicSessions.id], name: 'daily_attendance_registers_session_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.sectionId], foreignColumns: [academicSections.tenantId, academicSections.schoolId, academicSections.sessionId, academicSections.id], name: 'daily_attendance_registers_section_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.createdByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'daily_attendance_registers_created_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.updatedByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'daily_attendance_registers_updated_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.createdByAccountId, table.createdByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'daily_attendance_registers_created_actor_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.updatedByAccountId, table.updatedByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'daily_attendance_registers_updated_actor_fk' }).onDelete('restrict'),
  unique('daily_attendance_registers_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('daily_attendance_registers_daily_unique').on(table.tenantId, table.schoolId, table.sessionId, table.sectionId, table.attendanceDate),
  index('daily_attendance_registers_date_section_idx').on(table.tenantId, table.schoolId, table.attendanceDate, table.sessionId, table.sectionId),
  tenantPolicy(table),
]).enableRLS();

export const dailyAttendanceEntries = pgTable('daily_attendance_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  registerId: uuid('register_id').notNull(),
  academicEnrollmentId: uuid('academic_enrollment_id').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.registerId], foreignColumns: [dailyAttendanceRegisters.tenantId, dailyAttendanceRegisters.schoolId, dailyAttendanceRegisters.id], name: 'daily_attendance_entries_register_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.academicEnrollmentId], foreignColumns: [studentAcademicEnrollments.tenantId, studentAcademicEnrollments.schoolId, studentAcademicEnrollments.id], name: 'daily_attendance_entries_enrollment_fk' }).onDelete('restrict'),
  unique('daily_attendance_entries_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('daily_attendance_entries_register_enrollment_unique').on(table.tenantId, table.schoolId, table.registerId, table.academicEnrollmentId),
  index('daily_attendance_entries_enrollment_idx').on(table.tenantId, table.schoolId, table.academicEnrollmentId),
  check('daily_attendance_entries_status_check', sql`${table.status} in ('present', 'absent', 'late', 'excused')`),
  tenantPolicy(table),
]).enableRLS();

export const dailyAttendanceEvents = pgTable('daily_attendance_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  registerId: uuid('register_id').notNull(),
  academicEnrollmentId: uuid('academic_enrollment_id').notNull(),
  actorAccountId: uuid('actor_account_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(),
  requestId: text('request_id').notNull(),
  previousStatus: text('previous_status'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.registerId], foreignColumns: [dailyAttendanceRegisters.tenantId, dailyAttendanceRegisters.schoolId, dailyAttendanceRegisters.id], name: 'daily_attendance_events_register_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.registerId, table.academicEnrollmentId], foreignColumns: [dailyAttendanceEntries.tenantId, dailyAttendanceEntries.schoolId, dailyAttendanceEntries.registerId, dailyAttendanceEntries.academicEnrollmentId], name: 'daily_attendance_events_entry_fk' }).onDelete('cascade'),
  foreignKey({ columns: [table.tenantId, table.actorMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'daily_attendance_events_actor_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.actorAccountId, table.actorMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'daily_attendance_events_actor_account_membership_fk' }).onDelete('restrict'),
  uniqueIndex('daily_attendance_events_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  index('daily_attendance_events_register_created_idx').on(table.tenantId, table.schoolId, table.registerId, table.createdAt, table.id),
  check('daily_attendance_events_status_check', sql`${table.status} in ('present', 'absent', 'late', 'excused')`),
  check('daily_attendance_events_previous_status_check', sql`${table.previousStatus} is null or ${table.previousStatus} in ('present', 'absent', 'late', 'excused')`),
  tenantPolicy(table),
]).enableRLS();

// Finance stores exact minor units. Issued charges and journal entries are append-only.
export const feeHeads = pgTable('fee_heads', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'fee_heads_school_fk' }).onDelete('restrict'),
  unique('fee_heads_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('fee_heads_code_unique').on(table.tenantId, table.schoolId, sql`upper(trim(${table.code}))`),
  tenantPolicy(table),
]).enableRLS();

export const feePlans = pgTable('fee_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(),
  classId: uuid('class_id').notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.sessionId, table.classId], foreignColumns: [academicClasses.tenantId, academicClasses.schoolId, academicClasses.sessionId, academicClasses.id], name: 'fee_plans_class_fk' }).onDelete('restrict'),
  unique('fee_plans_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('fee_plans_name_unique').on(table.tenantId, table.schoolId, table.sessionId, table.classId, sql`upper(trim(${table.name}))`),
  tenantPolicy(table),
]).enableRLS();

export const feePlanLines = pgTable('fee_plan_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  planId: uuid('plan_id').notNull(),
  headId: uuid('head_id').notNull(),
  label: text('label').notNull(),
  dueDate: date('due_date').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.planId], foreignColumns: [feePlans.tenantId, feePlans.schoolId, feePlans.id], name: 'fee_plan_lines_plan_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.headId], foreignColumns: [feeHeads.tenantId, feeHeads.schoolId, feeHeads.id], name: 'fee_plan_lines_head_fk' }).onDelete('restrict'),
  unique('fee_plan_lines_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('fee_plan_lines_plan_scope_id_unique').on(table.tenantId, table.schoolId, table.planId, table.id),
  check('fee_plan_lines_amount_check', sql`${table.amountMinor} > 0`),
  tenantPolicy(table),
]).enableRLS();

export const feeAssignments = pgTable('fee_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  planId: uuid('plan_id').notNull(),
  schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.planId], foreignColumns: [feePlans.tenantId, feePlans.schoolId, feePlans.id], name: 'fee_assignments_plan_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.schoolEnrollmentId], foreignColumns: [studentSchoolEnrollments.tenantId, studentSchoolEnrollments.schoolId, studentSchoolEnrollments.id], name: 'fee_assignments_enrollment_fk' }).onDelete('restrict'),
  unique('fee_assignments_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('fee_assignments_plan_enrollment_scope_id_unique').on(table.tenantId, table.schoolId, table.planId, table.schoolEnrollmentId, table.id),
  uniqueIndex('fee_assignments_plan_enrollment_unique').on(table.tenantId, table.schoolId, table.planId, table.schoolEnrollmentId),
  tenantPolicy(table),
]).enableRLS();

export const feeCharges = pgTable('fee_charges', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  assignmentId: uuid('assignment_id').notNull(),
  planId: uuid('plan_id').notNull(),
  planLineId: uuid('plan_line_id').notNull(),
  schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
  description: text('description').notNull(),
  currency: text('currency').notNull(),
  dueDate: date('due_date').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.planId, table.schoolEnrollmentId, table.assignmentId], foreignColumns: [feeAssignments.tenantId, feeAssignments.schoolId, feeAssignments.planId, feeAssignments.schoolEnrollmentId, feeAssignments.id], name: 'fee_charges_assignment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.planId, table.planLineId], foreignColumns: [feePlanLines.tenantId, feePlanLines.schoolId, feePlanLines.planId, feePlanLines.id], name: 'fee_charges_line_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.schoolEnrollmentId], foreignColumns: [studentSchoolEnrollments.tenantId, studentSchoolEnrollments.schoolId, studentSchoolEnrollments.id], name: 'fee_charges_enrollment_fk' }).onDelete('restrict'),
  unique('fee_charges_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('fee_charges_enrollment_scope_id_unique').on(table.tenantId, table.schoolId, table.schoolEnrollmentId, table.id),
  uniqueIndex('fee_charges_assignment_line_unique').on(table.tenantId, table.schoolId, table.assignmentId, table.planLineId),
  index('fee_charges_enrollment_idx').on(table.tenantId, table.schoolId, table.schoolEnrollmentId),
  check('fee_charges_amount_check', sql`${table.amountMinor} > 0`),
  tenantPolicy(table),
]).enableRLS();

export const feeReceiptCounters = pgTable('fee_receipt_counters', {
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  nextNumber: bigint('next_number', { mode: 'bigint' }).notNull().default(sql`1`),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId], foreignColumns: [schools.tenantId, schools.id], name: 'fee_receipt_counters_school_fk' }).onDelete('restrict'),
  unique('fee_receipt_counters_scope_unique').on(table.tenantId, table.schoolId),
  check('fee_receipt_counters_positive_check', sql`${table.nextNumber} > 0`),
  tenantPolicy(table),
]).enableRLS();

export const feePayments = pgTable('fee_payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
  receiptNumber: bigint('receipt_number', { mode: 'bigint' }).notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  method: text('method').notNull(),
  reference: text('reference'),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  actorAccountId: uuid('actor_account_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.schoolEnrollmentId], foreignColumns: [studentSchoolEnrollments.tenantId, studentSchoolEnrollments.schoolId, studentSchoolEnrollments.id], name: 'fee_payments_enrollment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.actorMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'fee_payments_actor_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.actorAccountId, table.actorMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'fee_payments_actor_fk' }).onDelete('restrict'),
  unique('fee_payments_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  unique('fee_payments_enrollment_scope_id_unique').on(table.tenantId, table.schoolId, table.schoolEnrollmentId, table.id),
  uniqueIndex('fee_payments_receipt_unique').on(table.tenantId, table.schoolId, table.receiptNumber),
  uniqueIndex('fee_payments_idempotency_unique').on(table.tenantId, table.schoolId, table.idempotencyKey),
  check('fee_payments_method_check', sql`${table.method} in ('cash', 'bank_transfer', 'cheque', 'card_terminal', 'other')`),
  check('fee_payments_amount_check', sql`${table.amountMinor} > 0`),
  tenantPolicy(table),
]).enableRLS();

export const feeLedgerEntries = pgTable('fee_ledger_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(),
  schoolId: uuid('school_id').notNull(),
  schoolEnrollmentId: uuid('school_enrollment_id').notNull(),
  chargeId: uuid('charge_id').notNull(),
  paymentId: uuid('payment_id'),
  kind: text('kind').notNull(),
  amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  reason: text('reason'),
  actorAccountId: uuid('actor_account_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.tenantId, table.schoolId, table.schoolEnrollmentId], foreignColumns: [studentSchoolEnrollments.tenantId, studentSchoolEnrollments.schoolId, studentSchoolEnrollments.id], name: 'fee_ledger_entries_enrollment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.schoolEnrollmentId, table.chargeId], foreignColumns: [feeCharges.tenantId, feeCharges.schoolId, feeCharges.schoolEnrollmentId, feeCharges.id], name: 'fee_ledger_entries_charge_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.schoolId, table.schoolEnrollmentId, table.paymentId], foreignColumns: [feePayments.tenantId, feePayments.schoolId, feePayments.schoolEnrollmentId, feePayments.id], name: 'fee_ledger_entries_payment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.tenantId, table.actorMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'fee_ledger_entries_actor_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [table.actorAccountId, table.actorMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'fee_ledger_entries_actor_fk' }).onDelete('restrict'),
  unique('fee_ledger_entries_scope_id_unique').on(table.tenantId, table.schoolId, table.id),
  uniqueIndex('fee_ledger_entries_charge_unique').on(table.tenantId, table.schoolId, table.chargeId).where(sql`${table.kind} = 'charge'`),
  uniqueIndex('fee_ledger_entries_reversal_unique').on(table.tenantId, table.schoolId, table.paymentId, table.chargeId).where(sql`${table.kind} = 'payment_reversal'`),
  index('fee_ledger_entries_enrollment_created_idx').on(table.tenantId, table.schoolId, table.schoolEnrollmentId, table.createdAt),
  check('fee_ledger_entries_kind_check', sql`${table.kind} in ('charge', 'concession', 'payment', 'payment_reversal')`),
  check('fee_ledger_entries_amount_check', sql`${table.amountMinor} > 0`),
  tenantPolicy(table),
]).enableRLS();

export const exams = pgTable('exams', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull(), schoolId: uuid('school_id').notNull(),
  sessionId: uuid('session_id').notNull(), classId: uuid('class_id').notNull(),
  name: text('name').notNull(), startDate: date('start_date').notNull(), endDate: date('end_date').notNull(),
  status: text('status').notNull().default('draft'), version: integer('version').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.schoolId, t.sessionId, t.classId], foreignColumns: [academicClasses.tenantId, academicClasses.schoolId, academicClasses.sessionId, academicClasses.id], name: 'exams_class_fk' }).onDelete('restrict'),
  unique('exams_scope_id').on(t.tenantId, t.schoolId, t.id),
  unique('exams_academic_id').on(t.tenantId, t.schoolId, t.sessionId, t.classId, t.id),
  uniqueIndex('exams_name_unique').on(t.tenantId, t.schoolId, t.sessionId, t.classId, sql`upper(trim(${t.name}))`),
  check('exams_dates_check', sql`${t.endDate} >= ${t.startDate}`),
  check('exams_status_check', sql`${t.status} in ('draft', 'open', 'completed')`),
  check('exams_version_check', sql`${t.version} >= 0`), tenantPolicy(t),
]).enableRLS();

export const examAssessments = pgTable('exam_assessments', {
  id: uuid('id').defaultRandom().primaryKey(), tenantId: uuid('tenant_id').notNull(), schoolId: uuid('school_id').notNull(),
  examId: uuid('exam_id').notNull(), sessionId: uuid('session_id').notNull(), classId: uuid('class_id').notNull(),
  sectionId: uuid('section_id').notNull(), subjectId: uuid('subject_id').notNull(),
  label: text('label').notNull(), assessmentDate: date('assessment_date').notNull(),
  maximumScore: integer('maximum_score').notNull(), passingScore: integer('passing_score').notNull(),
  status: text('status').notNull().default('draft'), version: integer('version').notNull().default(0),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.schoolId, t.sessionId, t.classId, t.examId], foreignColumns: [exams.tenantId, exams.schoolId, exams.sessionId, exams.classId, exams.id], name: 'exam_assessments_exam_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.tenantId, t.schoolId, t.sessionId, t.classId, t.sectionId], foreignColumns: [academicSections.tenantId, academicSections.schoolId, academicSections.sessionId, academicSections.classId, academicSections.id], name: 'exam_assessments_section_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.tenantId, t.schoolId, t.sessionId, t.subjectId], foreignColumns: [academicSubjects.tenantId, academicSubjects.schoolId, academicSubjects.sessionId, academicSubjects.id], name: 'exam_assessments_subject_fk' }).onDelete('restrict'),
  unique('exam_assessments_scope_id').on(t.tenantId, t.schoolId, t.id),
  unique('exam_assessments_exam_id').on(t.tenantId, t.schoolId, t.examId, t.id),
  uniqueIndex('exam_assessments_label_unique').on(t.tenantId, t.schoolId, t.examId, t.sectionId, t.subjectId, sql`upper(trim(${t.label}))`),
  check('exam_assessments_scores_check', sql`${t.maximumScore} between 1 and 100000 and ${t.passingScore} between 0 and ${t.maximumScore}`),
  check('exam_assessments_status_check', sql`${t.status} in ('draft', 'submitted', 'locked')`),
  check('exam_assessments_version_check', sql`${t.version} >= 0`), tenantPolicy(t),
]).enableRLS();

export const examMarks = pgTable('exam_marks', {
  id: uuid('id').defaultRandom().primaryKey(), tenantId: uuid('tenant_id').notNull(), schoolId: uuid('school_id').notNull(),
  assessmentId: uuid('assessment_id').notNull(), academicEnrollmentId: uuid('academic_enrollment_id').notNull(),
  displayName: text('display_name').notNull(), rollNumber: text('roll_number'),
  status: text('status').notNull().default('unmarked'), score: integer('score'), revision: integer('revision').notNull().default(0),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.schoolId, t.assessmentId], foreignColumns: [examAssessments.tenantId, examAssessments.schoolId, examAssessments.id], name: 'exam_marks_assessment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.tenantId, t.schoolId, t.academicEnrollmentId], foreignColumns: [studentAcademicEnrollments.tenantId, studentAcademicEnrollments.schoolId, studentAcademicEnrollments.id], name: 'exam_marks_enrollment_fk' }).onDelete('restrict'),
  unique('exam_marks_scope_id').on(t.tenantId, t.schoolId, t.assessmentId, t.id),
  uniqueIndex('exam_marks_roster_unique').on(t.tenantId, t.schoolId, t.assessmentId, t.academicEnrollmentId),
  check('exam_marks_score_check', sql`(${t.status} = 'scored' and ${t.score} is not null and ${t.score} between 0 and 100000) or (${t.status} in ('unmarked', 'absent', 'exempt') and ${t.score} is null)`),
  check('exam_marks_revision_check', sql`${t.revision} >= 0`), tenantPolicy(t),
]).enableRLS();

export const examCorrections = pgTable('exam_corrections', {
  id: uuid('id').defaultRandom().primaryKey(), tenantId: uuid('tenant_id').notNull(), schoolId: uuid('school_id').notNull(),
  assessmentId: uuid('assessment_id').notNull(), markId: uuid('mark_id').notNull(), baseRevision: integer('base_revision').notNull(),
  previousStatus: text('previous_status').notNull(), previousScore: integer('previous_score'),
  proposedStatus: text('proposed_status').notNull(), proposedScore: integer('proposed_score'), reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'), requestedByAccountId: uuid('requested_by_account_id').notNull(),
  requestedByMembershipId: uuid('requested_by_membership_id').notNull(), decidedByAccountId: uuid('decided_by_account_id'),
  decisionReason: text('decision_reason'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.schoolId, t.assessmentId, t.markId], foreignColumns: [examMarks.tenantId, examMarks.schoolId, examMarks.assessmentId, examMarks.id], name: 'exam_corrections_mark_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.tenantId, t.requestedByMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'exam_corrections_requester_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.requestedByAccountId, t.requestedByMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'exam_corrections_requester_fk' }).onDelete('restrict'),
  uniqueIndex('exam_corrections_pending_unique').on(t.tenantId, t.schoolId, t.markId).where(sql`${t.status} = 'pending'`),
  check('exam_corrections_status_check', sql`${t.status} in ('pending', 'approved', 'rejected')`),
  check('exam_corrections_proposal_check', sql`(${t.proposedStatus} = 'scored' and ${t.proposedScore} is not null and ${t.proposedScore} between 0 and 100000) or (${t.proposedStatus} in ('absent', 'exempt') and ${t.proposedScore} is null)`),
  check('exam_corrections_separation_check', sql`${t.decidedByAccountId} is null or ${t.decidedByAccountId} <> ${t.requestedByAccountId}`), tenantPolicy(t),
]).enableRLS();

export const examEvents = pgTable('exam_events', {
  id: uuid('id').defaultRandom().primaryKey(), tenantId: uuid('tenant_id').notNull(), schoolId: uuid('school_id').notNull(),
  examId: uuid('exam_id').notNull(), assessmentId: uuid('assessment_id'), eventType: text('event_type').notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull(), actorAccountId: uuid('actor_account_id').notNull(),
  actorMembershipId: uuid('actor_membership_id').notNull(), requestId: text('request_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.tenantId, t.schoolId, t.examId], foreignColumns: [exams.tenantId, exams.schoolId, exams.id], name: 'exam_events_exam_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.tenantId, t.schoolId, t.examId, t.assessmentId], foreignColumns: [examAssessments.tenantId, examAssessments.schoolId, examAssessments.examId, examAssessments.id], name: 'exam_events_assessment_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.tenantId, t.actorMembershipId], foreignColumns: [memberships.tenantId, memberships.id], name: 'exam_events_membership_fk' }).onDelete('restrict'),
  foreignKey({ columns: [t.actorAccountId, t.actorMembershipId], foreignColumns: [memberships.accountId, memberships.id], name: 'exam_events_actor_fk' }).onDelete('restrict'),
  index('exam_events_history_idx').on(t.tenantId, t.schoolId, t.examId, t.createdAt), tenantPolicy(t),
]).enableRLS();
