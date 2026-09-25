import { createHmac } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { normalizeEmailAddress } from '@classloom/db';
import type { AuthConfiguration } from './auth.service.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { Inject } from '@nestjs/common';
import { AuthRepository, InvitationError } from './auth.repository.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { EmailService } from './email.service.js';

@Injectable()
export class IdentityFlowService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  private digest(value: string): string {
    return createHmac('sha256', this.config.rateLimitKey).update(value).digest('hex');
  }

  async issueInvitation(tenantId: string, email: string) {
    const address = normalizeEmailAddress(email);
    const token = this.tokens.createOpaqueToken();
    const invitation = await this.repository.createInvitation({
      tenantId, email: address, tokenHash: token.hash,
      expiresAt: new Date(Date.now() + this.config.invitationTtlSeconds * 1000),
    });
    try {
      await this.email.sendInvitation(address, token.raw);
    } catch {
      await this.repository.revokeInvitation(tenantId, invitation.id);
      await this.repository.recordSecurityEvent({ eventType: 'invitation_delivery_failed', tenantId });
      throw new Error('Invitation delivery failed');
    }
    return { invitationId: invitation.id };
  }

  async acceptNewInvitation(rawToken: string, password: string, displayName?: string, source = 'unknown') {
    const limit = await this.repository.consumeRateLimit({ scope: 'invitation', subjectDigest: this.digest(source), ...this.config.rateLimits.invitation });
    if (!limit.allowed) throw new BadRequestException('Invitation could not be accepted');
    const tokenHash = this.tokens.hashToken(rawToken);
    try {
      const passwordHash = await this.passwords.hash(password);
      const result = await this.repository.acceptNewAccountInvitation({ tokenHash, passwordHash, displayName });
      await this.repository.recordSecurityEvent({ eventType: 'invitation_accepted', accountId: result.account.id, tenantId: result.membership.tenantId });
      return { accepted: true };
    } catch (error) {
      if (error instanceof InvitationError) throw new BadRequestException('Invitation could not be accepted');
      throw error;
    }
  }

  async acceptExistingInvitation(rawToken: string, accountId: string, sessionId: string, source = 'unknown', requestId?: string) {
    const limit = await this.repository.consumeRateLimit({ scope: 'invitation', subjectDigest: this.digest(source), ...this.config.rateLimits.invitation });
    if (!limit.allowed) throw new BadRequestException('Invitation could not be accepted');
    try {
      const membership = await this.repository.acceptExistingAccountInvitation(this.tokens.hashToken(rawToken), accountId);
      await this.repository.selectSessionMembership(accountId, sessionId, membership.id);
      await this.repository.recordSecurityEvent({ eventType: 'invitation_accepted', accountId, tenantId: membership.tenantId, requestId });
      return { accepted: true };
    } catch (error) {
      if (error instanceof InvitationError) throw new BadRequestException('Invitation could not be accepted');
      throw error;
    }
  }

  async requestPasswordReset(email: string, source = 'unknown', requestId?: string) {
    const normalizedEmail = normalizeEmailAddress(email);
    const sourceDigest = this.digest(source);
    const allowance = await this.repository.consumeRateLimit({
      scope: 'reset', subjectDigest: this.digest(`${normalizedEmail}|${source}`), ...this.config.rateLimits.reset,
    });
    if (allowance.allowed) {
      const record = await this.repository.findAccountCredentialByEmail(normalizedEmail);
      if (record && record.account.status === 'active') {
        void this.issueAndDeliverPasswordReset(record.account.id, normalizedEmail, requestId, sourceDigest).catch(() => undefined);
      }
    }
    return { accepted: true };
  }

  private async issueAndDeliverPasswordReset(accountId: string, email: string, requestId: string | undefined, sourceDigest: string) {
    const token = this.tokens.createOpaqueToken();
    await this.repository.createPasswordReset({ accountId, tokenHash: token.hash,
      expiresAt: new Date(Date.now() + this.config.passwordResetTtlSeconds * 1000) });
    try {
      await this.email.sendPasswordReset(email, token.raw);
      await this.repository.recordSecurityEvent({ eventType: 'password_reset_requested', accountId, requestId, sourceDigest });
    } catch {
      await this.repository.recordSecurityEvent({ eventType: 'password_reset_delivery_failed', accountId, requestId, sourceDigest });
    }
  }

  async confirmPasswordReset(rawToken: string, password: string, requestId?: string, source = 'unknown') {
    const tokenHash = this.tokens.hashToken(rawToken);
    const limit = await this.repository.consumeRateLimit({ scope: 'reset-confirm', subjectDigest: this.digest(source), ...this.config.rateLimits.reset });
    const valid = limit.allowed && await this.repository.isPasswordResetTokenValid(tokenHash);
    if (!valid) {
      await this.repository.recordSecurityEvent({ eventType: 'password_reset_rejected', requestId, sourceDigest: this.digest(source) });
      throw new BadRequestException('Password reset link is invalid or expired');
    }
    const passwordHash = await this.passwords.hash(password);
    const changed = await this.repository.consumePasswordReset({ tokenHash, passwordHash });
    await this.repository.recordSecurityEvent({ eventType: changed ? 'password_reset_completed' : 'password_reset_rejected', requestId, sourceDigest: this.digest(source) });
    if (!changed) throw new BadRequestException('Password reset link is invalid or expired');
    return { reset: true };
  }
}
