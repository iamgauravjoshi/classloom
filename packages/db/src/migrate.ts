import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

const databaseMigrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!databaseMigrationUrl) throw new Error('DATABASE_MIGRATION_URL is required');
const { db, close } = createDb(databaseMigrationUrl);
try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Database migrations applied');
} finally {
  await close();
}
