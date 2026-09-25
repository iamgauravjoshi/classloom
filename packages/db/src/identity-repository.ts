import { and, eq, isNull } from 'drizzle-orm';
import type { AppDb, TenantTransaction } from './client.js';
import { withAccountContext } from './account-context.js';
import { withTenantContext } from './tenant-context.js';
import {
  accountCredentials,
  accounts,
  memberships,
  sessions,
} from './schema.js';

export function normalizeEmailAddress(email: string): string {
  return email.trim().normalize('NFKC').toLowerCase();
}

export async function createAccountWithMembership(
  db: AppDb,
  input: { email: string; displayName?: string; passwordHash: string; tenantId: string },
) {
  return db.transaction(async (tx) => {
    const [account] = await tx.insert(accounts).values({
      normalizedEmail: normalizeEmailAddress(input.email),
      displayName: input.displayName ?? null,
    }).returning();
    if (!account) throw new Error('Account insert did not return a row');

    await tx.insert(accountCredentials).values({
      accountId: account.id,
      passwordHash: input.passwordHash,
    });

    const [membership] = await withTenantContext(tx as unknown as AppDb, input.tenantId, (tenantTx) =>
      tenantTx.insert(memberships).values({
        accountId: account.id,
        tenantId: input.tenantId,
      }).returning(),
    );
    if (!membership) throw new Error('Membership insert did not return a row');

    return { ...account, membershipId: membership.id };
  });
}

export async function findAccountCredentialByEmail(db: AppDb, email: string) {
  const [record] = await db.select({ account: accounts, credential: accountCredentials })
    .from(accounts)
    .innerJoin(accountCredentials, eq(accountCredentials.accountId, accounts.id))
    .where(eq(accounts.normalizedEmail, normalizeEmailAddress(email)))
    .limit(1);
  return record;
}

export async function listActiveMemberships(db: AppDb, accountId: string) {
  return withAccountContext(db, accountId, (tx) =>
    tx.select().from(memberships)
      .where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'active'))),
  );
}

export async function createSession(
  db: AppDb,
  input: {
    accountId: string;
    tokenHash: string;
    activeMembershipId?: string | null;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  },
) {
  const [session] = await db.insert(sessions).values({
    accountId: input.accountId,
    tokenHash: input.tokenHash,
    activeMembershipId: input.activeMembershipId ?? null,
    idleExpiresAt: input.idleExpiresAt,
    absoluteExpiresAt: input.absoluteExpiresAt,
  }).returning();
  if (!session) throw new Error('Session insert did not return a row');
  return session;
}

export async function getSessionByTokenHash(db: AppDb, tokenHash: string) {
  const [record] = await db.select({ session: sessions, account: accounts, activeMembership: memberships })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .leftJoin(memberships, and(
      eq(memberships.id, sessions.activeMembershipId),
      eq(memberships.accountId, sessions.accountId),
    ))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (!record) return undefined;
  return {
    ...record.session,
    account: record.account,
    activeMembership: record.activeMembership,
  };
}

export async function selectSessionMembership(
  db: AppDb,
  accountId: string,
  sessionId: string,
  membershipId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const eligible = await withAccountContext(tx as unknown as AppDb, accountId, (accountTx) =>
      accountTx.select({ id: memberships.id }).from(memberships)
        .where(and(
          eq(memberships.id, membershipId),
          eq(memberships.accountId, accountId),
          eq(memberships.status, 'active'),
        )).limit(1),
    );
    if (eligible.length === 0) return false;

    const updated = await tx.update(sessions)
      .set({ activeMembershipId: membershipId })
      .where(and(
        eq(sessions.id, sessionId),
        eq(sessions.accountId, accountId),
        isNull(sessions.revokedAt),
      ))
      .returning({ id: sessions.id });
    return updated.length === 1;
  });
}

export async function touchSession(
  db: AppDb,
  sessionId: string,
  now: Date,
  idleExpiresAt: Date,
) {
  const [session] = await db.update(sessions)
    .set({ lastSeenAt: now, idleExpiresAt })
    .where(and(
      eq(sessions.id, sessionId),
      isNull(sessions.revokedAt),
    ))
    .returning();
  return session;
}

export async function revokeSession(db: AppDb, sessionId: string, revokedAt = new Date()) {
  const [session] = await db.update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return Boolean(session);
}

export async function revokeSessionsForAccount(db: AppDb, accountId: string, revokedAt = new Date()) {
  const revoked = await db.update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.accountId, accountId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.length;
}

export type IdentityTransaction = TenantTransaction;
