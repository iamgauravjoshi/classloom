import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { normalizeEmailAddress } from '@classloom/db';
import type { parseEnv } from '../config/env.js';
import { AuthRepository } from './auth.repository.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { AUTH_CONFIG } from './auth.constants.js';
import { createHmac } from 'node:crypto';

export type AuthConfiguration = ReturnType<typeof parseEnv>;

export interface AuthenticatedSession {
  accountId: string;
  email: string;
  displayName: string | null;
  sessionId: string;
  activeMembershipId: string | null;
  tenantId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfiguration,
  ) {}

  async login(email: string, password: string, source = 'unknown', requestId?: string) {
    const normalizedEmail = normalizeEmailAddress(email);
    const subjectDigest = createHmac('sha256', this.config.rateLimitKey)
      .update(`${normalizedEmail}|${source}`).digest('hex');
    const allowance = await this.repository.checkRateLimit({
      scope: 'login', subjectDigest, windowSeconds: this.config.rateLimits.login.windowSeconds,
    });
    if (!allowance.allowed) throw new UnauthorizedException('Email or password is incorrect');
    const record = await this.repository.findAccountCredentialByEmail(normalizedEmail);
    const passwordMatches = await this.passwords.verify(record?.credential.passwordHash ?? null, password);

    if (!record || record.account.status !== 'active' || !passwordMatches) {
      await this.repository.consumeRateLimit({ scope: 'login', subjectDigest, ...this.config.rateLimits.login });
      await this.repository.recordSecurityEvent({
        eventType: 'login_rejected', accountId: record?.account.id ?? null, requestId, sourceDigest: subjectDigest,
      });
      throw new UnauthorizedException('Email or password is incorrect');
    }

    await this.repository.recordSecurityEvent({ eventType: 'login_succeeded', accountId: record.account.id, requestId, sourceDigest: subjectDigest });

    const activeMemberships = await this.repository.listActiveMemberships(record.account.id);
    const activeMembership = activeMemberships.length === 1 ? activeMemberships[0]! : null;
    const sessionToken = this.tokens.createSessionToken();
    const now = new Date();
    const absoluteExpiresAt = new Date(now.getTime() + this.config.sessionAbsoluteTtlSeconds * 1000);
    const session = await this.repository.createSessionIfPasswordHashUnchanged({
      accountId: record.account.id,
      tokenHash: sessionToken.hash,
      activeMembershipId: activeMembership?.id ?? null,
      passwordHash: record.credential.passwordHash,
      idleExpiresAt: new Date(Math.min(
        now.getTime() + this.config.sessionIdleTtlSeconds * 1000,
        absoluteExpiresAt.getTime(),
      )),
      absoluteExpiresAt,
    });
    if (!session) throw new UnauthorizedException('Email or password is incorrect');

    return {
      sessionToken: sessionToken.raw,
      account: {
        id: record.account.id,
        email: record.account.normalizedEmail,
        displayName: record.account.displayName,
      },
      activeMembership,
      activeMemberships,
      workspaceSelectionRequired: activeMemberships.length > 1,
    };
  }

  async authenticate(rawToken: string): Promise<AuthenticatedSession> {
    const session = await this.repository.getSessionByTokenHash(this.tokens.hashToken(rawToken));
    const now = new Date();
    if (!session) throw new UnauthorizedException('Authentication required');

    const absoluteExpiresAt = new Date(session.absoluteExpiresAt);
    const idleExpiresAt = new Date(session.idleExpiresAt);
    const expired = absoluteExpiresAt <= now || idleExpiresAt <= now;
    if (session.revokedAt || expired || session.account.status !== 'active') {
      if (!session.revokedAt) await this.repository.revokeSession(session.id, now);
      if (session.account.status !== 'active') {
        await this.repository.revokeSessionsForAccount(session.accountId, now);
      }
      throw new UnauthorizedException('Authentication required');
    }

    if (session.activeMembershipId && (
      !session.activeMembership ||
      session.activeMembership.status !== 'active' ||
      session.activeMembership.accountId !== session.accountId
    )) {
      await this.repository.revokeSession(session.id, now);
      throw new UnauthorizedException('Authentication required');
    }

    const nextIdleExpiry = new Date(Math.min(
      now.getTime() + this.config.sessionIdleTtlSeconds * 1000,
      absoluteExpiresAt.getTime(),
    ));
    await this.repository.touchSession(session.id, now, nextIdleExpiry);

    return {
      accountId: session.accountId,
      email: session.account.normalizedEmail,
      displayName: session.account.displayName,
      sessionId: session.id,
      activeMembershipId: session.activeMembershipId,
      tenantId: session.activeMembership?.tenantId ?? null,
    };
  }

  async logout(rawToken?: string): Promise<void> {
    if (!rawToken) return;
    const session = await this.repository.getSessionByTokenHash(this.tokens.hashToken(rawToken));
    if (session) await this.repository.revokeSession(session.id);
  }

  async memberships(accountId: string) {
    return this.repository.listActiveMemberships(accountId);
  }

  async selectMembership(accountId: string, sessionId: string, membershipId: string): Promise<void> {
    const selected = await this.repository.selectSessionMembership(accountId, sessionId, membershipId);
    if (!selected) throw new ForbiddenException('Membership is unavailable');
  }
}
