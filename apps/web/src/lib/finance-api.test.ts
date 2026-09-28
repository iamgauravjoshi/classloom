import { describe, expect, it } from 'vitest';
import { decimalToMinor, formatMinor } from './finance-api';

describe('exact currency conversion', () => {
  it('preserves cents without floating point arithmetic', () => {
    expect(decimalToMinor('1234.56', 'INR')).toBe('123456');
    expect(formatMinor('123456', 'INR')).toBe('₹1,234.56');
    expect(decimalToMinor('9999999999999.99', 'INR')).toBe('999999999999999');
  });

  it('honors currencies without fractional units and rejects excess precision', () => {
    expect(decimalToMinor('1250', 'JPY')).toBe('1250');
    expect(() => decimalToMinor('12.50', 'JPY')).toThrow('decimal places');
    expect(() => decimalToMinor('12.345', 'USD')).toThrow('decimal places');
    expect(() => decimalToMinor('0', 'USD')).toThrow('greater than zero');
  });
});
