export const PERMISSION_CATALOG = [
  { key: 'authorization.roles.read', family: 'authorization.roles', scopeKind: 'tenant', action: 'read', readOnly: true },
  { key: 'authorization.roles.manage', family: 'authorization.roles', scopeKind: 'tenant', action: 'manage', readOnly: false },
  { key: 'memberships.read', family: 'memberships', scopeKind: 'tenant', action: 'read', readOnly: true },
  { key: 'memberships.invite', family: 'memberships', scopeKind: 'tenant', action: 'invite', readOnly: false },
  { key: 'memberships.suspend', family: 'memberships', scopeKind: 'tenant', action: 'suspend', readOnly: false },
  { key: 'school.read', family: 'school', scopeKind: 'school', action: 'read', readOnly: true },
  { key: 'school.manage', family: 'school', scopeKind: 'school', action: 'manage', readOnly: false },
  { key: 'staff.read', family: 'staff', scopeKind: 'school', action: 'read', readOnly: true },
  { key: 'staff.manage', family: 'staff', scopeKind: 'school', action: 'manage', readOnly: false },
  { key: 'campus.read', family: 'campus', scopeKind: 'campus', action: 'read', readOnly: true },
  { key: 'campus.manage', family: 'campus', scopeKind: 'campus', action: 'manage', readOnly: false },
  { key: 'attendance.read', family: 'attendance', scopeKind: 'campus', action: 'read', readOnly: true },
  { key: 'attendance.record', family: 'attendance', scopeKind: 'campus', action: 'record', readOnly: false },
  { key: 'marks.read', family: 'marks', scopeKind: 'academic', action: 'read', readOnly: true },
  { key: 'marks.enter', family: 'marks', scopeKind: 'academic', action: 'enter', readOnly: false },
  { key: 'results.publish', family: 'results', scopeKind: 'academic', action: 'publish', readOnly: false },
  { key: 'finance.read', family: 'finance', scopeKind: 'school', action: 'read', readOnly: true },
  { key: 'payments.record', family: 'payments', scopeKind: 'school', action: 'record', readOnly: false },
  { key: 'payments.adjust', family: 'payments', scopeKind: 'school', action: 'adjust', readOnly: false },
  { key: 'reports.export', family: 'reports', scopeKind: 'tenant', action: 'export', readOnly: false },
] as const;

export type PermissionKey = typeof PERMISSION_CATALOG[number]['key'];
export type AuthorizationScopeKind = 'tenant' | 'school' | 'campus' | 'academic' | 'relationship';

export const BUILT_IN_ROLE_TEMPLATES = [
  {
    key: 'tenant_admin', name: 'Tenant administrator',
    permissionKeys: PERMISSION_CATALOG.map(({ key }) => key),
  },
  {
    key: 'school_admin', name: 'School administrator',
    permissionKeys: [
      'school.read', 'school.manage', 'campus.read', 'campus.manage',
      'staff.read', 'staff.manage',
      'attendance.read', 'attendance.record', 'marks.read', 'marks.enter',
      'results.publish', 'finance.read', 'payments.record', 'payments.adjust', 'reports.export',
    ],
  },
  {
    key: 'principal', name: 'Principal',
    permissionKeys: [
      'school.read', 'staff.read', 'campus.read', 'attendance.read', 'marks.read',
      'marks.enter', 'results.publish', 'finance.read', 'reports.export',
    ],
  },
  {
    key: 'teacher', name: 'Teacher',
    permissionKeys: ['school.read', 'campus.read', 'attendance.read', 'attendance.record', 'marks.read', 'marks.enter'],
  },
  {
    key: 'attendance_operator', name: 'Attendance operator',
    permissionKeys: ['school.read', 'campus.read', 'attendance.read', 'attendance.record'],
  },
  {
    key: 'finance_operator', name: 'Finance operator',
    permissionKeys: ['school.read', 'finance.read', 'payments.record'],
  },
  {
    key: 'auditor', name: 'Auditor',
    permissionKeys: PERMISSION_CATALOG.filter(({ readOnly }) => readOnly).map(({ key }) => key),
  },
] as const satisfies readonly {
  key: string;
  name: string;
  permissionKeys: readonly PermissionKey[];
}[];
