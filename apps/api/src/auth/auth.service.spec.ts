import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../config/env.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';

const config = parseEnv({ DATABASE_URL: 'postgresql://localhost/classloom_test' });
const account = {
  id: '8e703a54-0ea0-48f4-a6a7-6530ed26c819',
  normalizedEmail: 'staff@example.test',
  displayName: 'Staff User',
  status: 'active',
};
const membership = {
  id: '0e564e17-a3b1-4b90-9190-94aa79a11726',
  accountId: account.id,
  tenantId: '92a218d0-7e42-48ec-896b-baa31b120a4d',
  status: 'active',
};

describe('AuthService', () => {
  let repository: {
    findAccountCredentialByEmail: ReturnType<typeof vi.fn>;
    listActiveMemberships: ReturnType<typeof vi.fn>;
    createSession: ReturnType<typeof vi.fn>;
    createSessionIfPasswordHashUnchanged: ReturnType<typeof vi.fn>;
    getSessionByTokenHash: ReturnType<typeof vi.fn>;
    touchSession: ReturnType<typeof vi.fn>;
    revokeSession: ReturnType<typeof vi.fn>;
    revokeSessionsForAccount: ReturnType<typeof vi.fn>;
    selectSessionMembership: ReturnType<typeof vi.fn>;
    consumeRateLimit: ReturnType<typeof vi.fn>;
    checkRateLimit: ReturnType<typeof vi.fn>;
    recordSecurityEvent: ReturnType<typeof vi.fn>;
  };
  let passwords: { verify: ReturnType<typeof vi.fn> };
  let tokens: TokenService;
  let service: AuthService;

  beforeEach(() => {
    repository = {
      findAccountCredentialByEmail: vi.fn(),
      listActiveMemberships: vi.fn().mockResolvedValue([membership]),
      createSession: vi.fn().mockResolvedValue({ id: 'session-id' }),
      createSessionIfPasswordHashUnchanged: vi.fn().mockResolvedValue({ id: 'session-id' }),
      getSessionByTokenHash: vi.fn(),
      touchSession: vi.fn(),
      revokeSession: vi.fn(),
      revokeSessionsForAccount: vi.fn(),
      selectSessionMembership: vi.fn(),
      consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAt: null }),
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAt: null }),
      recordSecurityEvent: vi.fn().mockResolvedValue(undefined),
    };
    passwords = { verify: vi.fn().mockResolvedValue(true) };
    tokens = new TokenService();
    service = new AuthService(
      repository as unknown as AuthRepository,
      passwords as unknown as PasswordService,
      tokens,
      config,
    );
  });

  it('creates a hashed server session and selects the sole active membership', async () => {
    repository.findAccountCredentialByEmail.mockResolvedValue({
      account,
      credential: { passwordHash: 'argon2id$stored', passwordUpdatedAt: new Date() },
    });

    const result = await service.login(' STAFF@example.test ', 'a valid long password');

    expect(repository.findAccountCredentialByEmail).toHaveBeenCalledWith('staff@example.test');
    expect(repository.createSessionIfPasswordHashUnchanged).toHaveBeenCalledWith(expect.objectContaining({
      accountId: account.id,
      tokenHash: expect.not.stringContaining(result.sessionToken),
      activeMembershipId: membership.id,
    }));
    expect(result.account).toEqual({ id: account.id, email: account.normalizedEmail, displayName: account.displayName });
    expect(result.activeMembership).toEqual(membership);
  });

  it('does not choose a tenant when several active memberships exist', async () => {
    repository.findAccountCredentialByEmail.mockResolvedValue({
      account,
      credential: { passwordHash: 'argon2id$stored', passwordUpdatedAt: new Date() },
    });
    repository.listActiveMemberships.mockResolvedValue([membership, { ...membership, id: 'another-membership' }]);

    const result = await service.login(account.normalizedEmail, 'a valid long password');

    expect(repository.createSessionIfPasswordHashUnchanged).toHaveBeenCalledWith(expect.objectContaining({ activeMembershipId: null }));
    expect(result.activeMembership).toBeNull();
    expect(result.workspaceSelectionRequired).toBe(true);
  });

  it('creates a tenantless session for an account with no active memberships', async () => {
    repository.findAccountCredentialByEmail.mockResolvedValue({
      account,
      credential: { passwordHash: 'argon2id$stored', passwordUpdatedAt: new Date() },
    });
    repository.listActiveMemberships.mockResolvedValue([]);

    const result = await service.login(account.normalizedEmail, 'a valid long password');

    expect(repository.createSessionIfPasswordHashUnchanged).toHaveBeenCalledWith(expect.objectContaining({ activeMembershipId: null }));
    expect(result.activeMembership).toBeNull();
    expect(result.workspaceSelectionRequired).toBe(false);
  });

  it('returns the same public login error for an unknown account and a wrong password', async () => {
    repository.findAccountCredentialByEmail.mockResolvedValue(undefined);
    const unknownError = await service.login('missing@example.test', 'a valid long password').catch((error) => error);
    repository.findAccountCredentialByEmail.mockResolvedValue({ account, credential: { passwordHash: 'stored', passwordUpdatedAt: new Date() } });
    passwords.verify.mockResolvedValue(false);
    const wrongPasswordError = await service.login(account.normalizedEmail, 'a valid long password').catch((error) => error);

    expect(unknownError).toBeInstanceOf(UnauthorizedException);
    expect(unknownError.getStatus()).toBe(wrongPasswordError.getStatus());
    expect(unknownError.getResponse()).toEqual(wrongPasswordError.getResponse());
    expect(passwords.verify).toHaveBeenCalledWith(null, 'a valid long password');
  });

  it('rejects a session whose active membership was suspended', async () => {
    const token = tokens.createSessionToken();
    const now = new Date();
    repository.getSessionByTokenHash.mockResolvedValue({
      id: 'session-id',
      accountId: account.id,
      activeMembershipId: membership.id,
      revokedAt: null,
      idleExpiresAt: new Date(now.getTime() + 60_000),
      absoluteExpiresAt: new Date(now.getTime() + 60_000),
      account,
      activeMembership: { ...membership, status: 'suspended' },
    });

    await expect(service.authenticate(token.raw)).rejects.toMatchObject({ status: 401 });
    expect(repository.touchSession).not.toHaveBeenCalled();
  });

  it('rejects and revokes idle-expired or absolutely expired sessions', async () => {
    const token = tokens.createSessionToken();
    const now = new Date();
    for (const expiration of [
      { idleExpiresAt: new Date(now.getTime() - 1), absoluteExpiresAt: new Date(now.getTime() + 60_000) },
      { idleExpiresAt: new Date(now.getTime() + 60_000), absoluteExpiresAt: new Date(now.getTime() - 1) },
    ]) {
      repository.getSessionByTokenHash.mockResolvedValue({
        id: 'session-id', accountId: account.id, activeMembershipId: null,
        revokedAt: null, ...expiration, account, activeMembership: null,
      });
      await expect(service.authenticate(token.raw)).rejects.toMatchObject({ status: 401 });
    }
    expect(repository.revokeSession).toHaveBeenCalledTimes(2);
    expect(repository.touchSession).not.toHaveBeenCalled();
  });

  it('revokes all account sessions when the account is suspended', async () => {
    const token = tokens.createSessionToken();
    repository.getSessionByTokenHash.mockResolvedValue({
      id: 'session-id', accountId: account.id, activeMembershipId: null,
      revokedAt: null, idleExpiresAt: new Date(Date.now() + 60_000),
      absoluteExpiresAt: new Date(Date.now() + 60_000),
      account: { ...account, status: 'suspended' }, activeMembership: null,
    });

    await expect(service.authenticate(token.raw)).rejects.toMatchObject({ status: 401 });
    expect(repository.revokeSessionsForAccount).toHaveBeenCalledWith(account.id, expect.any(Date));
    expect(repository.touchSession).not.toHaveBeenCalled();
  });

  it('extends idle expiry but never past the absolute expiry', async () => {
    const token = tokens.createSessionToken();
    const absoluteExpiresAt = new Date(Date.now() + 30_000);
    repository.getSessionByTokenHash.mockResolvedValue({
      id: 'session-id', accountId: account.id, activeMembershipId: null,
      revokedAt: null, idleExpiresAt: new Date(Date.now() + 1_000),
      absoluteExpiresAt, account, activeMembership: null,
    });

    await expect(service.authenticate(token.raw)).resolves.toMatchObject({
      accountId: account.id, activeMembershipId: null, tenantId: null,
    });
    const [, , nextIdleExpiry] = repository.touchSession.mock.calls[0]!;
    expect(nextIdleExpiry.getTime()).toBeLessThanOrEqual(absoluteExpiresAt.getTime());
    expect(nextIdleExpiry.getTime()).toBeGreaterThan(Date.now() - 100);
  });

  it('counts failed login attempts but does not count successful logins', async () => {
    repository.findAccountCredentialByEmail.mockResolvedValue({ account, credential: { passwordHash: 'stored', passwordUpdatedAt: new Date() } });
    passwords.verify.mockResolvedValue(false);
    await expect(service.login(account.normalizedEmail, 'wrong password')).rejects.toMatchObject({ status: 401 });
    expect(repository.consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: 'login' }));
    repository.consumeRateLimit.mockClear();
    passwords.verify.mockResolvedValue(true);
    await service.login(account.normalizedEmail, 'correct password');
    expect(repository.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('does not create a session when the credential version changed during password verification', async () => {
    repository.findAccountCredentialByEmail.mockResolvedValue({ account, credential: { passwordHash: 'stored', passwordUpdatedAt: new Date() } });
    repository.createSessionIfPasswordHashUnchanged.mockResolvedValue(undefined);
    await expect(service.login(account.normalizedEmail, 'correct password')).rejects.toMatchObject({ status: 401 });
  });
});
