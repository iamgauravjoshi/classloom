import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  boolean,
  check,
  date,
  integer,
  jsonb,
  pgTable,
  pgPolicy,
  serial,
  text,
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
  tenantPolicy(table),
]).enableRLS();
