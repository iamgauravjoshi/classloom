import { describe, expect, it } from 'vitest';
import { formatScore, scoreToHundredths } from './examinations-api';
describe('marks conversion', () => {
  it('preserves zero and two decimal places without floating point rounding', () => {
    expect(scoreToHundredths('0')).toBe(0); expect(scoreToHundredths('72.51')).toBe(7251); expect(scoreToHundredths('1000')).toBe(100000);
    expect(formatScore(7251)).toBe('72.51');
  });
  it('rejects missing, negative, overprecision, exponent, and overmaximum marks', () => {
    for (const value of ['', '-1', '72.515', '1e2', 'NaN', '1001']) expect(() => scoreToHundredths(value)).toThrow();
    expect(() => scoreToHundredths('51', 5000)).toThrow('cannot exceed 50');
  });
});
