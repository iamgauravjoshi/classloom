import { checkDatabase } from './client.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!(await checkDatabase(databaseUrl))) throw new Error('Database is unavailable');
console.log('Database is available');
