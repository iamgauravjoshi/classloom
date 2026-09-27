import { describe, expect, it } from 'vitest';
import {
  EnrollmentError,
  normalizeAcademicEnrollmentInput,
  normalizeSchoolEnrollmentInput,
  requireActiveEnrollment,
} from './enrollment.js';

describe('enrollment lifecycle rules', () => {
  it('normalizes admission and roll numbers and validates calendar dates', () => {
    expect(normalizeSchoolEnrollmentInput({ admissionNumber: ' adm-001 ', admissionDate: '2026-04-01' })).toEqual({
      admissionNumber: 'ADM-001', admissionDate: '2026-04-01',
    });
    expect(normalizeAcademicEnrollmentInput({ rollNumber: ' 08-a ', startDate: '2026-04-02' })).toEqual({
      rollNumber: '08-A', startDate: '2026-04-02',
    });
    expect(() => normalizeSchoolEnrollmentInput({ admissionNumber: 'bad number', admissionDate: '2026-02-30' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID' }) as EnrollmentError);
  });

  it('allows workflow transitions only from active enrollment', () => {
    expect(() => requireActiveEnrollment('active', 'transfer')).not.toThrow();
    expect(() => requireActiveEnrollment('transferred', 'withdraw')).toThrow(/active academic enrollment/i);
    expect(() => requireActiveEnrollment('completed', 'complete')).toThrowError(
      expect.objectContaining({ code: 'CONFLICT' }) as EnrollmentError,
    );
  });

  it('rejects transition dates before the current placement start', () => {
    expect(() => normalizeAcademicEnrollmentInput({ startDate: '2026-03-31' }, '2026-04-01')).toThrow(/before/i);
  });
});
