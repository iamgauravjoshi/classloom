import { createHash, randomBytes } from 'node:crypto';

export class TokenService {
  createSessionToken(): { raw: string; hash: string } {
    return this.createOpaqueToken();
  }

  createOpaqueToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hashToken(raw) };
  }

  hashToken(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }
}
