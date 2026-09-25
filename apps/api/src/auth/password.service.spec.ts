import { describe, expect, it } from 'vitest';
import { PasswordService, validatePassword } from './password.service.js';

describe('password service', () => {
  const passwords = new PasswordService({ memoryKiB: 19_456, timeCost: 2, parallelism: 1 });

  it('accepts 15 through 256 Unicode code points, including long passphrases and whitespace', () => {
    expect(validatePassword('a'.repeat(14)).success).toBe(false);
    expect(validatePassword('a'.repeat(15)).success).toBe(true);
    expect(validatePassword('a'.repeat(64)).success).toBe(true);
    expect(validatePassword(` ${'密'.repeat(14)} `).success).toBe(true);
    expect(validatePassword('a'.repeat(257)).success).toBe(false);
  });

  it('hashes with Argon2id and verifies only the matching password', async () => {
    const hash = await passwords.hash('correct long passphrase');

    expect(hash).toContain('$argon2id$');
    await expect(passwords.verify(hash, 'correct long passphrase')).resolves.toBe(true);
    await expect(passwords.verify(hash, 'wrong long passphrase')).resolves.toBe(false);
  });

  it('rejects passwords outside policy before hashing', async () => {
    await expect(passwords.hash('too short')).rejects.toMatchObject({ code: 'PASSWORD_POLICY' });
  });

  it('returns false for malformed hashes without leaking an exception', async () => {
    await expect(passwords.verify('not-an-argon-hash', 'long enough password')).resolves.toBe(false);
  });
});
