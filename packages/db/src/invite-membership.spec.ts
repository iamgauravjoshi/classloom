import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb } from './client.js';
import { createAccountWithMembership } from './identity-repository.js';
import {
  acceptInvitationForExistingAccount,
  acceptInvitationForNewAccount,
  createMembershipInvitation,
  InvitationError,
} from './invite-membership.js';

const runtimeUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
const integrationEnabled = Boolean(runtimeUrl && migrationUrl);

describe('invitation membership repository', () => {
  it.skipIf(!integrationEnabled)('creates the invited account and membership atomically and consumes once', async () => {
    const tenantId = randomUUID();
    const email = `invite-${tenantId}@example.test`;
    const tokenHash = `sha256:${tenantId}`;
    tenants.push(tenantId);
    emails.push(email);
    await admin!`insert into tenants (id, name, slug) values (${tenantId}, 'Invite School', ${`invite-${tenantId}`})`;
    await createMembershipInvitation(runtime!.db, {
      tenantId, email: email.toUpperCase(), tokenHash, expiresAt: new Date(Date.now() + 60_000),
    });
    const diagnostic = await admin!`select count(*)::int as count from invitations where token_hash = ${tokenHash}`;
    expect(diagnostic[0]?.count).toBe(1);

    const accepted = await acceptInvitationForNewAccount(runtime!.db, {
      tokenHash, passwordHash: 'argon2id:test', displayName: 'Invited User',
    });

    expect(accepted).toMatchObject({
      account: { normalizedEmail: email },
      membership: { accountId: accepted.account.id, tenantId, status: 'active' },
    });
    await expect(acceptInvitationForNewAccount(runtime!.db, {
      tokenHash, passwordHash: 'argon2id:replay',
    })).rejects.toBeInstanceOf(InvitationError);
  });

  it.skipIf(!integrationEnabled)('requires an existing account to authenticate before attaching another membership', async () => {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const email = `existing-${tenantA}@example.test`;
    const wrongEmail = `wrong-${tenantA}@example.test`;
    tenants.push(tenantA, tenantB);
    emails.push(email, wrongEmail);
    await admin!`
      insert into tenants (id, name, slug) values
        (${tenantA}, 'Existing A', ${`existing-a-${tenantA}`}),
        (${tenantB}, 'Existing B', ${`existing-b-${tenantB}`})
    `;
    const existing = await createAccountWithMembership(runtime!.db, {
      email, displayName: 'Existing User', passwordHash: 'argon2id:existing', tenantId: tenantA,
    });
    const tokenHash = `sha256:${tenantB}`;
    await createMembershipInvitation(runtime!.db, {
      tenantId: tenantB, email, tokenHash, expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(acceptInvitationForNewAccount(runtime!.db, { tokenHash, passwordHash: 'argon2id:new' }))
      .rejects.toMatchObject({ code: 'ACCOUNT_EXISTS' });
    await expect(acceptInvitationForExistingAccount(runtime!.db, tokenHash, existing.id))
      .resolves.toMatchObject({ accountId: existing.id, tenantId: tenantB });
    await expect(acceptInvitationForExistingAccount(runtime!.db, tokenHash, existing.id))
      .rejects.toBeInstanceOf(InvitationError);
  });

  it.skipIf(!integrationEnabled)('allows only one concurrent invitation acceptance', async () => {
    const tenantId = randomUUID();
    const email = `concurrent-${tenantId}@example.test`;
    const tokenHash = `sha256:${tenantId}`;
    tenants.push(tenantId);
    emails.push(email);
    await admin!`insert into tenants (id, name, slug) values (${tenantId}, 'Concurrent School', ${`concurrent-${tenantId}`})`;
    await createMembershipInvitation(runtime!.db, {
      tenantId, email, tokenHash, expiresAt: new Date(Date.now() + 60_000),
    });

    const results = await Promise.allSettled([
      acceptInvitationForNewAccount(runtime!.db, { tokenHash, passwordHash: 'argon2id:first' }),
      acceptInvitationForNewAccount(runtime!.db, { tokenHash, passwordHash: 'argon2id:second' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  });

  it.skipIf(!integrationEnabled)('rejects expired invitations and allows a replacement after expiry', async () => {
    const tenantId = randomUUID();
    const email = `expired-${tenantId}@example.test`;
    const tokenHash = `expired:${tenantId}`;
    tenants.push(tenantId); emails.push(email);
    await admin!`insert into tenants (id,name,slug) values (${tenantId},'Expired School',${`expired-${tenantId}`})`;
    await createMembershipInvitation(runtime!.db,{tenantId,email,tokenHash,expiresAt:new Date(Date.now()-1000)});
    await expect(acceptInvitationForNewAccount(runtime!.db,{tokenHash,passwordHash:'expired'}))
      .rejects.toMatchObject({code:'INVITATION_EXPIRED'});
    await createMembershipInvitation(runtime!.db,{tenantId,email,tokenHash:`live:${tenantId}`,expiresAt:new Date(Date.now()+60_000)});
    await expect(acceptInvitationForNewAccount(runtime!.db,{tokenHash:`live:${tenantId}`,passwordHash:'argon2id:test'}))
      .resolves.toMatchObject({account:{normalizedEmail:email}});
  });
});

let admin: ReturnType<typeof postgres> | undefined;
let runtime: ReturnType<typeof createDb> | undefined;
const tenants: string[] = [];
const emails: string[] = [];

beforeAll(() => {
  if (!integrationEnabled) return;
  admin = postgres(migrationUrl!, { max: 1 });
  runtime = createDb(runtimeUrl!, { maxConnections: 4 });
});

afterAll(async () => {
  if (admin && emails.length) await admin`delete from accounts where normalized_email = any(${admin.array(emails)})`;
  if (admin && tenants.length) await admin`delete from tenants where id::text = any(${admin.array(tenants)})`;
  await admin?.end();
  await runtime?.close();
});
