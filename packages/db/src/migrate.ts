import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const { db, close } = createDb(databaseUrl);
try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Database migrations applied');
} finally {
  await close();
}
