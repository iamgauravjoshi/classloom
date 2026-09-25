import { and, eq, gt, isNull } from 'drizzle-orm';
import type { AppDb, TenantTransaction } from './client.js';
import { withAccountContext } from './account-context.js';
import { withTenantContext } from './tenant-context.js';
import {
  accountCredentials,
  accounts,
  authRateLimits,
  memberships,
  passwordResetTokens,
  securityEvents,
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

export async function createSessionIfPasswordHashUnchanged(
  db: AppDb,
  input: Parameters<typeof createSession>[1] & { passwordHash: string },
) {
  return db.transaction(async (tx) => {
    const [credential] = await tx.select({ accountId: accountCredentials.accountId })
      .from(accountCredentials).where(and(
        eq(accountCredentials.accountId, input.accountId),
        eq(accountCredentials.passwordHash, input.passwordHash),
      )).for('share').limit(1);
    if (!credential) return undefined;
    const [session] = await tx.insert(sessions).values({
      accountId: input.accountId, tokenHash: input.tokenHash,
      activeMembershipId: input.activeMembershipId ?? null,
      idleExpiresAt: input.idleExpiresAt, absoluteExpiresAt: input.absoluteExpiresAt,
    }).returning();
    return session;
  });
}

export async function getSessionByTokenHash(db: AppDb, tokenHash: string) {
  return db.transaction(async (tx) => {
    const [record] = await tx.select({ session: sessions, account: accounts })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .where(eq(sessions.tokenHash, tokenHash))
      .limit(1);
    if (!record) return undefined;

    const [activeMembership] = record.session.activeMembershipId
      ? await withAccountContext(tx as unknown as AppDb, record.session.accountId, (accountTx) =>
        accountTx.select().from(memberships).where(and(
          eq(memberships.id, record.session.activeMembershipId!),
          eq(memberships.accountId, record.session.accountId),
        )).limit(1),
      )
      : [];

    return { ...record.session, account: record.account, activeMembership: activeMembership ?? null };
  });
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

export async function createPasswordResetToken(db: AppDb, input: { accountId: string; tokenHash: string; expiresAt: Date }) {
  const [row] = await db.insert(passwordResetTokens).values(input).returning();
  return row;
}

export async function isPasswordResetTokenValid(db: AppDb, tokenHash: string, now = new Date()) {
  const [row] = await db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(and(
    eq(passwordResetTokens.tokenHash, tokenHash), isNull(passwordResetTokens.consumedAt), gt(passwordResetTokens.expiresAt, now),
  )).limit(1);
  return Boolean(row);
}

export async function consumePasswordResetToken(db: AppDb, input: { tokenHash: string; passwordHash: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [token] = await tx.select().from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, input.tokenHash)).for('update').limit(1);
    if (!token || token.consumedAt || token.expiresAt <= now) return false;
    await tx.update(accountCredentials).set({ passwordHash: input.passwordHash, passwordUpdatedAt: now })
      .where(eq(accountCredentials.accountId, token.accountId));
    await tx.update(passwordResetTokens).set({ consumedAt: now }).where(and(
      eq(passwordResetTokens.accountId, token.accountId), isNull(passwordResetTokens.consumedAt),
    ));
    await tx.update(sessions).set({ revokedAt: now }).where(and(
      eq(sessions.accountId, token.accountId), isNull(sessions.revokedAt),
    ));
    return true;
  });
}

export async function recordSecurityEvent(db: AppDb, input: {
  eventType: string; accountId?: string | null; tenantId?: string | null; requestId?: string | null;
  sourceDigest?: string | null; metadata?: Record<string, string | number | boolean | null>;
}) {
  const [row] = await db.insert(securityEvents).values(input).returning();
  return row;
}

export async function consumeAuthRateLimit(db: AppDb, input: {
  scope: string; subjectDigest: string; limit: number; windowSeconds: number; now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    await tx.insert(authRateLimits).values({
      scope: input.scope, subjectDigest: input.subjectDigest, attempts: 0, windowStartedAt: now,
    }).onConflictDoNothing();
    const [row] = await tx.select().from(authRateLimits).where(and(
      eq(authRateLimits.scope, input.scope), eq(authRateLimits.subjectDigest, input.subjectDigest),
    )).for('update').limit(1);
    if (!row) throw new Error('Rate limit row could not be locked');
    const reset = now.getTime() - row.windowStartedAt.getTime() >= input.windowSeconds * 1000;
    if (!reset && row.blockedUntil !== null && row.blockedUntil > now) {
      return { allowed: false, retryAt: row.blockedUntil };
    }
    const attempts = reset ? 1 : row.attempts + 1;
    const blockedUntil = attempts >= input.limit ? new Date(now.getTime() + input.windowSeconds * 1000) : null;
    await tx.update(authRateLimits).set({
      attempts, windowStartedAt: reset ? now : row.windowStartedAt, blockedUntil, updatedAt: now,
    }).where(eq(authRateLimits.id, row.id));
    return { allowed: attempts <= input.limit, retryAt: attempts > input.limit ? blockedUntil : null };
  });
}

export async function checkAuthRateLimit(db: AppDb, input: {
  scope: string; subjectDigest: string; windowSeconds: number; now?: Date;
}) {
  const now = input.now ?? new Date();
  const [row] = await db.select().from(authRateLimits).where(and(
    eq(authRateLimits.scope, input.scope), eq(authRateLimits.subjectDigest, input.subjectDigest),
  )).limit(1);
  const blocked = Boolean(row && now.getTime() - row.windowStartedAt.getTime() < input.windowSeconds * 1000
    && row.blockedUntil && row.blockedUntil > now);
  return { allowed: !blocked, retryAt: blocked ? row!.blockedUntil : null };
}

export type IdentityTransaction = TenantTransaction;
