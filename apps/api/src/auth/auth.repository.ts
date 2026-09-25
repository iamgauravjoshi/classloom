import { Inject, Injectable } from '@nestjs/common';
import {
  createSession,
  createSessionIfPasswordHashUnchanged,
  createMembershipInvitation,
  revokeMembershipInvitation,
  acceptInvitationForExistingAccount,
  acceptInvitationForNewAccount,
  createPasswordResetToken,
  isPasswordResetTokenValid,
  consumePasswordResetToken,
  consumeAuthRateLimit,
  checkAuthRateLimit,
  recordSecurityEvent,
  findAccountCredentialByEmail,
  getSessionByTokenHash,
  listActiveMemberships,
  normalizeEmailAddress,
  revokeSession,
  revokeSessionsForAccount,
  selectSessionMembership,
  InvitationError,
  touchSession,
} from '@classloom/db';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AuthRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  findAccountCredentialByEmail(email: string) {
    return findAccountCredentialByEmail(this.database.db, normalizeEmailAddress(email));
  }

  listActiveMemberships(accountId: string) {
    return listActiveMemberships(this.database.db, accountId);
  }

  createSession(input: Parameters<typeof createSession>[1]) {
    return createSession(this.database.db, input);
  }

  createSessionIfPasswordHashUnchanged(input: Parameters<typeof createSessionIfPasswordHashUnchanged>[1]) {
    return createSessionIfPasswordHashUnchanged(this.database.db, input);
  }

  getSessionByTokenHash(tokenHash: string) {
    return getSessionByTokenHash(this.database.db, tokenHash);
  }

  touchSession(sessionId: string, now: Date, idleExpiresAt: Date) {
    return touchSession(this.database.db, sessionId, now, idleExpiresAt);
  }

  revokeSession(sessionId: string, revokedAt?: Date) {
    return revokeSession(this.database.db, sessionId, revokedAt);
  }

  revokeSessionsForAccount(accountId: string, revokedAt?: Date) {
    return revokeSessionsForAccount(this.database.db, accountId, revokedAt);
  }

  selectSessionMembership(accountId: string, sessionId: string, membershipId: string) {
    return selectSessionMembership(this.database.db, accountId, sessionId, membershipId);
  }

  createInvitation(input: { tenantId: string; email: string; tokenHash: string; expiresAt: Date }) {
    return createMembershipInvitation(this.database.db, input);
  }

  revokeInvitation(tenantId: string, invitationId: string) {
    return revokeMembershipInvitation(this.database.db, tenantId, invitationId);
  }

  acceptNewAccountInvitation(input: { tokenHash: string; passwordHash: string; displayName?: string }) {
    return acceptInvitationForNewAccount(this.database.db, input);
  }

  acceptExistingAccountInvitation(tokenHash: string, accountId: string) {
    return acceptInvitationForExistingAccount(this.database.db, tokenHash, accountId);
  }

  createPasswordReset(input: { accountId: string; tokenHash: string; expiresAt: Date }) {
    return createPasswordResetToken(this.database.db, input);
  }

  isPasswordResetTokenValid(tokenHash: string) {
    return isPasswordResetTokenValid(this.database.db, tokenHash);
  }

  consumePasswordReset(input: { tokenHash: string; passwordHash: string }) {
    return consumePasswordResetToken(this.database.db, input);
  }

  consumeRateLimit(input: { scope: string; subjectDigest: string; limit: number; windowSeconds: number }) {
    return consumeAuthRateLimit(this.database.db, input);
  }

  checkRateLimit(input: { scope: string; subjectDigest: string; windowSeconds: number }) {
    return checkAuthRateLimit(this.database.db, input);
  }

  recordSecurityEvent(input: Parameters<typeof recordSecurityEvent>[1]) {
    return recordSecurityEvent(this.database.db, input);
  }
}

export { InvitationError };
