import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  pgPolicy,
  serial,
  text,
  timestamp,
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
