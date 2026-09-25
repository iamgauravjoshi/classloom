import { describe, expect, it } from 'vitest';
import { validateAcademicSession, validateAcademicCode } from './academics.js';

describe('academic setup rules', () => {
  it('rejects a session whose end date is not after its start date', () => {
    expect(() => validateAcademicSession({ name: '2026–27', code: '2026', startDate: '2026-04-01', endDate: '2026-03-31' })).toThrow();
  });

  it('normalizes and validates codes', () => {
    expect(validateAcademicCode('  grade-01  ')).toBe('GRADE-01');
    expect(() => validateAcademicCode('bad code')).toThrow();
  });

  it('rejects a calendar date that rolls into another month', () => {
    expect(() => validateAcademicSession({ name: '2026–27', code: '2026', startDate: '2026-02-30', endDate: '2027-03-31' })).toThrow();
  });
});
