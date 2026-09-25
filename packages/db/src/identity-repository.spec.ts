import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb } from './client.js';
import {
  createAccountWithMembership,
  createSession,
  getSessionByTokenHash,
  listActiveMemberships,
  selectSessionMembership,
} from './identity-repository.js';
import { memberships } from './schema.js';

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const integrationEnabled = Boolean(runtimeUrl && migrationUrl);

describe('identity repository', () => {
  it.skipIf(!integrationEnabled)(
    'creates accounts atomically and exposes only the signed-in account memberships',
    async () => {
      const tenantA = randomUUID();
      const tenantB = randomUUID();
      const emailA = `account-a-${tenantA}@example.test`;
      const emailB = `account-b-${tenantB}@example.test`;
      tenants.push(tenantA, tenantB);
      accounts.push(emailA, emailB);
      await admin!`
        insert into tenants (id, name, slug) values
          (${tenantA}, 'Identity A', ${`identity-a-${tenantA}`}),
          (${tenantB}, 'Identity B', ${`identity-b-${tenantB}`})
      `;

      const accountA = await createAccountWithMembership(runtime!.db, {
        email: emailA,
        displayName: 'Account A',
        passwordHash: 'argon2id:test-a',
        tenantId: tenantA,
      });
      const accountB = await createAccountWithMembership(runtime!.db, {
        email: emailB,
        displayName: 'Account B',
        passwordHash: 'argon2id:test-b',
        tenantId: tenantB,
      });

      await expect(listActiveMemberships(runtime!.db, accountA.id)).resolves.toEqual([
        expect.objectContaining({ accountId: accountA.id, tenantId: tenantA, status: 'active' }),
      ]);
      await expect(runtime!.db.select().from(memberships)).resolves.toEqual([]);

      const session = await createSession(runtime!.db, {
        accountId: accountA.id,
        tokenHash: 'sha256:token-a',
        idleExpiresAt: new Date(Date.now() + 60_000),
        absoluteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
      });
      expect(await getSessionByTokenHash(runtime!.db, 'sha256:token-a')).toMatchObject({
        id: session.id,
        accountId: accountA.id,
        activeMembershipId: null,
      });
      await expect(selectSessionMembership(runtime!.db, accountA.id, session.id, accountB.membershipId))
        .resolves.toBe(false);
      await expect(selectSessionMembership(runtime!.db, accountA.id, session.id, accountA.membershipId))
        .resolves.toBe(true);

      await expect(createAccountWithMembership(runtime!.db, {
        email: `rollback-${tenantA}@example.test`,
        displayName: 'Rollback',
        passwordHash: 'argon2id:test-rollback',
        tenantId: 'not-a-uuid',
      })).rejects.toThrow('tenantId must be a valid UUID');
      const rolledBack = await admin!`select id from accounts where normalized_email = ${`rollback-${tenantA}@example.test`}`;
      expect(rolledBack).toEqual([]);
    },
  );
});

let admin: ReturnType<typeof postgres> | undefined;
let runtime: ReturnType<typeof createDb> | undefined;
const tenants: string[] = [];
const accounts: string[] = [];

beforeAll(() => {
  if (!integrationEnabled) return;
  admin = postgres(migrationUrl!, { max: 1 });
  runtime = createDb(runtimeUrl!, { maxConnections: 1 });
});

afterAll(async () => {
  if (admin && accounts.length) {
    await admin`delete from accounts where normalized_email in ${admin(accounts)}`;
  }
  if (admin && tenants.length) await admin`delete from tenants where id in ${admin(tenants)}`;
  await admin?.end();
  await runtime?.close();
});
