import { describe, expect, it } from 'vitest';
import { assertVersion, validateMark, type MarkValue } from './examinations.js';

describe('examination marks rules', () => {
  it('preserves zero and exact hundredths while enforcing the assessment maximum', () => {
    expect(validateMark({ status: 'scored', score: 0 }, 10000)).toEqual({ status: 'scored', score: 0 });
    expect(validateMark({ status: 'scored', score: 7251 }, 10000).score).toBe(7251);
    for (const score of [null, -1, 10001, 1.5, NaN]) expect(() => validateMark({ status: 'scored', score }, 10000)).toThrow('Marks must be between');
  });
  it('requires explicit complete outcomes on submission and null nonnumeric outcomes', () => {
    expect(() => validateMark({ status: 'unmarked', score: null }, 10000, true)).toThrow('every student');
    expect(() => validateMark({ status: 'absent', score: 0 }, 10000)).toThrow('cannot include a score');
    expect(() => validateMark({ status: 'unknown', score: null } as unknown as MarkValue, 10000)).toThrow('valid marks outcome');
    expect(validateMark({ status: 'exempt', score: null }, 10000, true).status).toBe('exempt');
  });
  it('rejects a stale version with a recoverable message', () => {
    expect(() => assertVersion(2, 1)).toThrow('Refresh before saving');
    expect(() => assertVersion(2, 2)).not.toThrow();
  });
});
