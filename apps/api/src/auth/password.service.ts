import argon2 from 'argon2';
import { PASSWORD_MAX_CODE_POINTS, PASSWORD_MIN_CODE_POINTS } from './auth.constants.js';

export interface Argon2Parameters {
  memoryKiB: number;
  timeCost: number;
  parallelism: number;
}

export class PasswordPolicyError extends Error {
  readonly code = 'PASSWORD_POLICY';

  constructor(message: string) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

export function validatePassword(password: string): { success: true } | { success: false; message: string } {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_CODE_POINTS) {
    return { success: false, message: `Password must contain at least ${PASSWORD_MIN_CODE_POINTS} characters` };
  }
  if (length > PASSWORD_MAX_CODE_POINTS) {
    return { success: false, message: `Password must contain no more than ${PASSWORD_MAX_CODE_POINTS} characters` };
  }
  return { success: true };
}

export class PasswordService {
  private readonly dummyHash: Promise<string>;

  constructor(private readonly parameters: Argon2Parameters) {
    this.dummyHash = argon2.hash('ClassLoom dummy verification password', {
      type: argon2.argon2id,
      memoryCost: parameters.memoryKiB,
      timeCost: parameters.timeCost,
      parallelism: parameters.parallelism,
    });
  }

  async hash(password: string): Promise<string> {
    const validation = validatePassword(password);
    if (!validation.success) throw new PasswordPolicyError(validation.message);

    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: this.parameters.memoryKiB,
      timeCost: this.parameters.timeCost,
      parallelism: this.parameters.parallelism,
    });
  }

  async verify(hash: string | null, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash ?? await this.dummyHash, password);
    } catch {
      return false;
    }
  }
}
