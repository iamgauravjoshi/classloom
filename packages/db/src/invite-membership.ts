import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { AppDb } from './client.js';
import { withTenantContext } from './tenant-context.js';
import { accountCredentials, accounts, invitations, memberships } from './schema.js';
import { normalizeEmailAddress } from './identity-repository.js';

export type InvitationErrorCode = 'INVITATION_INVALID' | 'INVITATION_EXPIRED' | 'ACCOUNT_EXISTS' | 'EMAIL_MISMATCH' | 'ACCOUNT_SUSPENDED';
export class InvitationError extends Error {
  constructor(readonly code: InvitationErrorCode) { super(code); }
}

export async function createMembershipInvitation(db: AppDb, input: { tenantId: string; email: string; tokenHash: string; expiresAt: Date; now?: Date }) {
  const now = input.now ?? new Date();
  return withTenantContext(db, input.tenantId, async (tx) => {
    await tx.update(invitations).set({ status: 'expired' }).where(and(
      eq(invitations.tenantId, input.tenantId), eq(invitations.status, 'pending'), lt(invitations.expiresAt, now),
    ));
    const [row] = await tx.insert(invitations).values({
      tenantId: input.tenantId, normalizedEmail: normalizeEmailAddress(input.email),
      tokenHash: input.tokenHash, expiresAt: input.expiresAt,
    }).returning();
    return row;
  });
}

export async function revokeMembershipInvitation(db: AppDb, tenantId: string, invitationId: string) {
  return withTenantContext(db, tenantId, async (tx) => {
    const [row] = await tx.update(invitations).set({ status: 'revoked' }).where(and(
      eq(invitations.id, invitationId), eq(invitations.status, 'pending'),
    )).returning({ id: invitations.id });
    return Boolean(row);
  });
}

async function lockInvitation(tx: Parameters<Parameters<AppDb['transaction']>[0]>[0], tokenHash: string, now: Date) {
  await tx.execute(sql`select set_config('app.invitation_token_hash', ${tokenHash}, true)`);
  const [invite] = await tx.select().from(invitations).where(eq(invitations.tokenHash, tokenHash)).for('update').limit(1);
  if (!invite || invite.status !== 'pending') throw new InvitationError('INVITATION_INVALID');
  if (invite.expiresAt <= now) {
    await tx.update(invitations).set({ status: 'expired' }).where(eq(invitations.id, invite.id));
    throw new InvitationError('INVITATION_EXPIRED');
  }
  return invite;
}

export async function acceptInvitationForNewAccount(db: AppDb, input: { tokenHash: string; passwordHash: string; displayName?: string; now?: Date }) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const invite = await lockInvitation(tx, input.tokenHash, now);
    const [existing] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.normalizedEmail, invite.normalizedEmail)).limit(1);
    if (existing) throw new InvitationError('ACCOUNT_EXISTS');
    const [account] = await tx.insert(accounts).values({ normalizedEmail: invite.normalizedEmail, displayName: input.displayName ?? null }).returning();
    if (!account) throw new Error('Account insert did not return a row');
    await tx.insert(accountCredentials).values({ accountId: account.id, passwordHash: input.passwordHash });
    const [membership] = await withTenantContext(tx as unknown as AppDb, invite.tenantId, (tenantTx) =>
      tenantTx.insert(memberships).values({ accountId: account.id, tenantId: invite.tenantId }).returning());
    if (!membership) throw new Error('Membership insert did not return a row');
    await withTenantContext(tx as unknown as AppDb, invite.tenantId, (tenantTx) =>
      tenantTx.update(invitations).set({ status: 'accepted', acceptedAt: now }).where(eq(invitations.id, invite.id)));
    return { account, membership };
  });
}

export async function acceptInvitationForExistingAccount(db: AppDb, tokenHash: string, accountId: string, now = new Date()) {
  return db.transaction(async (tx) => {
    const invite = await lockInvitation(tx, tokenHash, now);
    const [account] = await tx.select().from(accounts).where(eq(accounts.id, accountId)).limit(1);
    if (!account || account.status !== 'active') throw new InvitationError('ACCOUNT_SUSPENDED');
    if (account.normalizedEmail !== invite.normalizedEmail) throw new InvitationError('EMAIL_MISMATCH');
    const [membership] = await withTenantContext(tx as unknown as AppDb, invite.tenantId, async (tenantTx) => {
      const [found] = await tenantTx.select().from(memberships).where(and(
        eq(memberships.accountId, accountId), eq(memberships.tenantId, invite.tenantId),
      )).limit(1);
      if (found) {
        if (found.status !== 'active') return tenantTx.update(memberships).set({ status: 'active' }).where(eq(memberships.id, found.id)).returning();
        return [found];
      }
      return tenantTx.insert(memberships).values({ accountId, tenantId: invite.tenantId }).returning();
    });
    await withTenantContext(tx as unknown as AppDb, invite.tenantId, (tenantTx) =>
      tenantTx.update(invitations).set({ status: 'accepted', acceptedAt: now }).where(eq(invitations.id, invite.id)));
    if (!membership) throw new Error('Membership insert did not return a row');
    return membership;
  });
}
