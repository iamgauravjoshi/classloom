import { describe, expect, it } from 'vitest';
import { normalizeStaffCode, normalizeStaffListFilters, normalizeStaffProfile } from './staff.js';

describe('staff input rules', () => {
  it('normalizes a staff code and rejects unsupported characters', () => {
    expect(normalizeStaffCode(' ab-12 ')).toBe('AB-12');
    expect(() => normalizeStaffCode('bad code')).toThrow('Staff code');
    expect(() => normalizeStaffCode('')).toThrow('Staff code');
  });

  it('trims names and normalizes optional contact fields', () => {
    expect(normalizeStaffProfile({
      staffCode: ' p-1 ', givenName: ' Priya ', familyName: ' Sharma ',
      preferredName: '  Pri ', workEmail: ' Priya@Example.Test ', phone: ' +91 12345 ',
    })).toEqual({
      staffCode: 'P-1', givenName: 'Priya', familyName: 'Sharma',
      preferredName: 'Pri', workEmail: 'priya@example.test', phone: '+91 12345',
    });
    expect(() => normalizeStaffProfile({ staffCode: 'P-1', givenName: ' ', familyName: 'Sharma' })).toThrow('Given name');
  });

  it('bounds directory limits and search length', () => {
    expect(normalizeStaffListFilters({}).limit).toBe(25);
    expect(normalizeStaffListFilters({ limit: 200, q: '  Priya  ' })).toMatchObject({ limit: 100, q: 'Priya' });
    expect(() => normalizeStaffListFilters({ limit: 0 })).toThrow('Page size');
    expect(() => normalizeStaffListFilters({ q: 'x'.repeat(121) })).toThrow('Search');
  });
});
