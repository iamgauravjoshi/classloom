import { pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const appMetadata = pgTable('app_metadata', {
  id: serial('id').primaryKey(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('app_metadata_key_unique').on(table.key)]);
