import { sql } from 'drizzle-orm';
import {
  foreignKey,
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
  uniqueIndex('campuses_school_code_unique').on(table.tenantId, table.schoolId, table.code),
  pgPolicy('campuses_tenant_isolation', {
    for: 'all',
    to: 'public',
    using: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
    withCheck: sql`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`,
  }),
]).enableRLS();
