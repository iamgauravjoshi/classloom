import { describe, expect, it } from 'vitest';
import {
  AdmissionError,
  normalizeAdmissionCaseInput,
  nextAdmissionStatus,
  type AdmissionStatus,
} from './admissions.js';

describe('admission case lifecycle', () => {
  it('allows only the approved lifecycle transitions', () => {
    const allowed: [AdmissionStatus, Parameters<typeof nextAdmissionStatus>[1], AdmissionStatus][] = [
      ['enquiry', 'draft', 'draft'],
      ['enquiry', 'withdraw', 'withdrawn'],
      ['draft', 'submit', 'submitted'],
      ['draft', 'withdraw', 'withdrawn'],
      ['submitted', 'return_to_draft', 'draft'],
      ['submitted', 'start_review', 'under_review'],
      ['submitted', 'withdraw', 'withdrawn'],
      ['under_review', 'return_to_draft', 'draft'],
      ['under_review', 'accept', 'accepted'],
      ['under_review', 'reject', 'rejected'],
      ['under_review', 'withdraw', 'withdrawn'],
      ['accepted', 'admit', 'admitted'],
    ];
    for (const [current, action, expected] of allowed) {
      expect(nextAdmissionStatus(current, action, 'Reviewed')).toBe(expected);
    }
    expect(() => nextAdmissionStatus('accepted', 'reject', 'Changed mind')).toThrow(AdmissionError);
    expect(() => nextAdmissionStatus('admitted', 'withdraw', 'Too late')).toThrow(AdmissionError);
  });

  it('requires a reason for decisions and withdrawals', () => {
    expect(() => nextAdmissionStatus('under_review', 'accept')).toThrow('A decision note is required');
    expect(() => nextAdmissionStatus('under_review', 'reject', '  ')).toThrow('A decision note is required');
    expect(() => nextAdmissionStatus('draft', 'withdraw')).toThrow('A withdrawal reason is required');
    expect(nextAdmissionStatus('under_review', 'reject', 'Does not meet admission criteria')).toBe('rejected');
  });
});

describe('admission case normalization', () => {
  it('trims bounded applicant and guardian fields and rejects more than ten guardians', () => {
    const normalized = normalizeAdmissionCaseInput({
      status: 'draft',
      studentGivenName: ' Mira ',
      studentFamilyName: ' Smoke ',
      studentEmail: ' mira@example.test ',
      guardians: [{
        givenName: ' Ravi ', familyName: ' Smoke ', relationshipType: 'father', email: ' ravi@example.test ',
      }],
    });
    expect(normalized).toMatchObject({
      studentGivenName: 'Mira', studentFamilyName: 'Smoke', studentEmail: 'mira@example.test',
      guardians: [{ givenName: 'Ravi', familyName: 'Smoke', email: 'ravi@example.test', ordinal: 1 }],
    });
    expect(() => normalizeAdmissionCaseInput({
      guardians: Array.from({ length: 11 }, (_, index) => ({ givenName: `G${index}`, familyName: 'Guardian', relationshipType: 'other' as const })),
    })).toThrow('At most 10 guardians can be added');
  });
});
