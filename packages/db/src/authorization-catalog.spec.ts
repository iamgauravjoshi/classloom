import { describe, expect, it } from 'vitest';
import { BUILT_IN_ROLE_TEMPLATES, PERMISSION_CATALOG } from './authorization-catalog.js';
import * as dbExports from './index.js';

describe('authorization catalog', () => {
  it('exports the catalog and built-in templates from the package entrypoint', () => {
    expect(dbExports.PERMISSION_CATALOG).toBe(PERMISSION_CATALOG);
    expect(dbExports.BUILT_IN_ROLE_TEMPLATES).toBe(BUILT_IN_ROLE_TEMPLATES);
  });

  it('contains no permission key more than once', () => {
    const keys = PERMISSION_CATALOG.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('defines unique built-in roles using catalog permissions only', () => {
    const roles = BUILT_IN_ROLE_TEMPLATES.map((role) => role.key);
    const permissions = new Set(PERMISSION_CATALOG.map((permission) => permission.key));

    expect(new Set(roles).size).toBe(roles.length);
    for (const role of BUILT_IN_ROLE_TEMPLATES) {
      expect(role.permissionKeys.every((key) => permissions.has(key))).toBe(true);
    }
  });

  it('gives the auditor read-only permissions', () => {
    const auditor = BUILT_IN_ROLE_TEMPLATES.find((role) => role.key === 'auditor');
    const permissionByKey = new Map(PERMISSION_CATALOG.map((permission) => [permission.key, permission]));

    expect(auditor).toBeDefined();
    expect(auditor!.permissionKeys.length).toBeGreaterThan(0);
    expect(auditor!.permissionKeys.every((key) => permissionByKey.get(key)?.readOnly)).toBe(true);
  });

  it('defines the approved initial role keys', () => {
    expect(BUILT_IN_ROLE_TEMPLATES.map((role) => role.key)).toEqual([
      'tenant_admin', 'school_admin', 'principal', 'teacher',
      'attendance_operator', 'finance_operator', 'auditor',
    ]);
  });

  it('restricts staff directory permissions to school leadership and auditors', () => {
    const permissionByKey = new Map(PERMISSION_CATALOG.map((permission) => [permission.key, permission]));
    expect(permissionByKey.get('staff.read')).toMatchObject({ scopeKind: 'school', readOnly: true });
    expect(permissionByKey.get('staff.manage')).toMatchObject({ scopeKind: 'school', readOnly: false });
    const role = (key: string) => BUILT_IN_ROLE_TEMPLATES.find((item) => item.key === key)?.permissionKeys;
    expect(role('tenant_admin')).toEqual(expect.arrayContaining(['staff.read', 'staff.manage']));
    expect(role('school_admin')).toEqual(expect.arrayContaining(['staff.read', 'staff.manage']));
    expect(role('principal')).toContain('staff.read');
    expect(role('auditor')).toContain('staff.read');
    expect(role('teacher')).not.toContain('staff.read');
  });

  it('restricts student guardian and enrollment permissions to approved school roles', () => {
    const permissionByKey = new Map(PERMISSION_CATALOG.map((permission) => [permission.key, permission]));
    expect(permissionByKey.get('student.read')).toEqual({ key: 'student.read', family: 'student', scopeKind: 'school', action: 'read', readOnly: true });
    expect(permissionByKey.get('student.manage')).toEqual({ key: 'student.manage', family: 'student', scopeKind: 'school', action: 'manage', readOnly: false });
    expect(permissionByKey.get('guardian.read')).toEqual({ key: 'guardian.read', family: 'guardian', scopeKind: 'school', action: 'read', readOnly: true });
    expect(permissionByKey.get('guardian.manage')).toEqual({ key: 'guardian.manage', family: 'guardian', scopeKind: 'school', action: 'manage', readOnly: false });
    expect(permissionByKey.get('enrollment.read')).toEqual({ key: 'enrollment.read', family: 'enrollment', scopeKind: 'school', action: 'read', readOnly: true });
    expect(permissionByKey.get('enrollment.manage')).toEqual({ key: 'enrollment.manage', family: 'enrollment', scopeKind: 'school', action: 'manage', readOnly: false });

    const role = (key: string) => BUILT_IN_ROLE_TEMPLATES.find((item) => item.key === key)?.permissionKeys;
    const read = ['student.read', 'guardian.read', 'enrollment.read'];
    const manage = ['student.manage', 'guardian.manage', 'enrollment.manage'];
    expect(role('tenant_admin')).toEqual(expect.arrayContaining([...read, ...manage]));
    expect(role('school_admin')).toEqual(expect.arrayContaining([...read, ...manage]));
    expect(role('principal')).toEqual(expect.arrayContaining(read));
    expect(role('auditor')).toEqual(expect.arrayContaining(read));
    expect(role('teacher')).not.toEqual(expect.arrayContaining(read));
  });
});
