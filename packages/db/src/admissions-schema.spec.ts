import { getTableColumns } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as dbExports from './index.js';
import * as schema from './schema.js';

describe('admissions schema', () => {
  it('exports case, guardian application, and event tables through the package entrypoint', () => {
    for (const name of ['admissionCases', 'admissionCaseGuardians', 'admissionCaseEvents'] as const) {
      expect(schema[name], `${name} schema export`).toBeDefined();
      expect(dbExports, `${name} db export`).toHaveProperty(name);
    }
  });

  it('includes tenant, school, lifecycle, application, and conversion fields', () => {
    const caseColumns = getTableColumns(schema.admissionCases);
    for (const name of [
      'id', 'tenantId', 'schoolId', 'caseReference', 'status', 'studentGivenName', 'studentFamilyName',
      'studentDateOfBirth', 'existingStudentId', 'requestedSessionId', 'requestedClassId', 'requestedSectionId',
      'convertedStudentId', 'convertedSchoolEnrollmentId', 'convertedAcademicEnrollmentId', 'createdByAccountId',
      'createdAt', 'updatedAt',
    ]) expect(caseColumns, `admissionCases.${name}`).toHaveProperty(name);

    const guardianColumns = getTableColumns(schema.admissionCaseGuardians);
    for (const name of ['id', 'tenantId', 'schoolId', 'caseId', 'ordinal', 'givenName', 'familyName', 'relationshipType', 'email', 'phone']) {
      expect(guardianColumns, `admissionCaseGuardians.${name}`).toHaveProperty(name);
    }
    const eventColumns = getTableColumns(schema.admissionCaseEvents);
    for (const name of ['id', 'tenantId', 'schoolId', 'caseId', 'actorAccountId', 'actorMembershipId', 'eventType', 'fromStatus', 'toStatus', 'createdAt']) {
      expect(eventColumns, `admissionCaseEvents.${name}`).toHaveProperty(name);
    }
  });

  it('enables tenant RLS on each table and declares case-reference and guardian-ordinal indexes', () => {
    for (const table of [schema.admissionCases, schema.admissionCaseGuardians, schema.admissionCaseEvents]) {
      const config = getTableConfig(table);
      expect(config.enableRLS).toBe(true);
      expect(config.policies.map((policy) => policy.name)).toContain('tenant_isolation');
    }
    const caseConfig = getTableConfig(schema.admissionCases);
    expect(caseConfig.indexes.some((index) => index.config.name === 'admission_cases_school_reference_unique')).toBe(true);
    const guardianConfig = getTableConfig(schema.admissionCaseGuardians);
    expect(guardianConfig.indexes.some((index) => index.config.name === 'admission_case_guardians_case_ordinal_unique')).toBe(true);
  });
});
