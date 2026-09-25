import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service.js';

describe('token service', () => {
  const tokens = new TokenService();

  it('creates session tokens with 256 bits of entropy and stores only a SHA-256 digest', () => {
    const first = tokens.createSessionToken();
    const second = tokens.createSessionToken();

    expect(Buffer.from(first.raw, 'base64url')).toHaveLength(32);
    expect(first.raw).not.toBe(second.raw);
    expect(first.hash).not.toBe(first.raw);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokens.hashToken(first.raw)).toBe(first.hash);
  });

  it('creates independent opaque invitation and reset tokens', () => {
    const invitation = tokens.createOpaqueToken();
    const reset = tokens.createOpaqueToken();

    expect(invitation.raw).not.toBe(reset.raw);
    expect(invitation.hash).not.toBe(reset.hash);
    expect(tokens.hashToken(reset.raw)).toBe(reset.hash);
  });
});
