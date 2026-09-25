import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export function createDb(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10 });
  return { db: drizzle(client), close: () => client.end() };
}

export async function checkDatabase(databaseUrl: string): Promise<boolean> {
  const client = postgres(databaseUrl, { max: 1, connect_timeout: 2, idle_timeout: 1 });
  try {
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client.end({ timeout: 1 });
  }
}
