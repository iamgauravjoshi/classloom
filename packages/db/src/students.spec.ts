import { describe, expect, it } from 'vitest';
import {
  StudentPeopleError,
  normalizeGuardianProfile,
  normalizeGuardianRelationship,
  normalizeStudentCode,
  normalizeStudentProfile,
} from './students.js';

describe('student and guardian input rules', () => {
  it('normalizes immutable student and guardian codes', () => {
    expect(normalizeStudentCode(' stu-001 ', 'Student')).toBe('STU-001');
    expect(normalizeStudentCode(' guardian_1 ', 'Guardian')).toBe('GUARDIAN_1');
    expect(() => normalizeStudentCode('bad code', 'Student')).toThrowError(
      expect.objectContaining({ code: 'INVALID', message: expect.stringMatching(/student code/i) }) as StudentPeopleError,
    );
  });

  it('trims names and contact data and validates a non-future birth date', () => {
    expect(normalizeStudentProfile({
      studentCode: ' s-1 ',
      givenName: ' Asha ',
      middleName: ' Devi ',
      familyName: ' Rao ',
      preferredName: ' Ash ',
      dateOfBirth: '2013-08-14',
      gender: ' Female ',
      email: ' ASHA@Example.Test ',
      phone: ' +91 90000 ',
    })).toEqual({
      studentCode: 'S-1',
      givenName: 'Asha',
      middleName: 'Devi',
      familyName: 'Rao',
      preferredName: 'Ash',
      dateOfBirth: '2013-08-14',
      gender: 'Female',
      email: 'asha@example.test',
      phone: '+91 90000',
    });
    expect(() => normalizeStudentProfile({
      studentCode: 'S-2', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2027-01-01',
    }, new Date('2026-09-26T00:00:00.000Z'))).toThrow('Date of birth cannot be in the future');
    expect(() => normalizeStudentProfile({
      studentCode: 'S-2', givenName: 'Asha', familyName: 'Rao', dateOfBirth: '2026-02-30',
    })).toThrow('Date of birth must be a valid calendar date');
  });

  it('normalizes guardian details and relationship flags', () => {
    expect(normalizeGuardianProfile({
      guardianCode: ' g-1 ', givenName: ' Ravi ', familyName: ' Rao ',
      email: ' RAVI@Example.Test ', occupation: ' Engineer ', countryCode: ' in ',
    })).toMatchObject({
      guardianCode: 'G-1', givenName: 'Ravi', familyName: 'Rao',
      email: 'ravi@example.test', occupation: 'Engineer', countryCode: 'IN',
    });
    expect(normalizeGuardianRelationship({ relationshipType: ' legal_guardian ' as 'legal_guardian', primaryContact: true })).toEqual({
      relationshipType: 'legal_guardian',
      primaryContact: true,
      emergencyContact: false,
      authorizedPickup: false,
      financialResponsibility: false,
      portalAccess: false,
      status: 'active',
    });
    expect(() => normalizeGuardianRelationship({ relationshipType: 'friend' as 'mother' })).toThrowError(
      expect.objectContaining({ code: 'INVALID', message: expect.stringMatching(/relationship/i) }) as StudentPeopleError,
    );
  });
});
