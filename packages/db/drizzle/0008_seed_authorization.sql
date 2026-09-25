INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES
  ('authorization.roles.read', 'authorization.roles', 'tenant', 'read', true),
  ('authorization.roles.manage', 'authorization.roles', 'tenant', 'manage', false),
  ('memberships.read', 'memberships', 'tenant', 'read', true),
  ('memberships.invite', 'memberships', 'tenant', 'invite', false),
  ('memberships.suspend', 'memberships', 'tenant', 'suspend', false),
  ('school.read', 'school', 'school', 'read', true),
  ('school.manage', 'school', 'school', 'manage', false),
  ('campus.read', 'campus', 'campus', 'read', true),
  ('campus.manage', 'campus', 'campus', 'manage', false),
  ('attendance.read', 'attendance', 'campus', 'read', true),
  ('attendance.record', 'attendance', 'campus', 'record', false),
  ('marks.read', 'marks', 'academic', 'read', true),
  ('marks.enter', 'marks', 'academic', 'enter', false),
  ('results.publish', 'results', 'academic', 'publish', false),
  ('finance.read', 'finance', 'school', 'read', true),
  ('payments.record', 'payments', 'school', 'record', false),
  ('payments.adjust', 'payments', 'school', 'adjust', false),
  ('reports.export', 'reports', 'tenant', 'export', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_roles (tenant_id, key, name, system_key)
SELECT tenants.id, role_template.key, role_template.name, role_template.key
FROM tenants
CROSS JOIN (VALUES
  ('tenant_admin', 'Tenant administrator'),
  ('school_admin', 'School administrator'),
  ('principal', 'Principal'),
  ('teacher', 'Teacher'),
  ('attendance_operator', 'Attendance operator'),
  ('finance_operator', 'Finance operator'),
  ('auditor', 'Auditor')
) AS role_template(key, name)
ON CONFLICT (tenant_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT role.tenant_id, role.id, grant_template.permission_key
FROM authorization_roles AS role
JOIN (VALUES
  ('tenant_admin', 'authorization.roles.read'),
  ('tenant_admin', 'authorization.roles.manage'),
  ('tenant_admin', 'memberships.read'),
  ('tenant_admin', 'memberships.invite'),
  ('tenant_admin', 'memberships.suspend'),
  ('tenant_admin', 'school.read'),
  ('tenant_admin', 'school.manage'),
  ('tenant_admin', 'campus.read'),
  ('tenant_admin', 'campus.manage'),
  ('tenant_admin', 'attendance.read'),
  ('tenant_admin', 'attendance.record'),
  ('tenant_admin', 'marks.read'),
  ('tenant_admin', 'marks.enter'),
  ('tenant_admin', 'results.publish'),
  ('tenant_admin', 'finance.read'),
  ('tenant_admin', 'payments.record'),
  ('tenant_admin', 'payments.adjust'),
  ('tenant_admin', 'reports.export'),
  ('school_admin', 'school.read'),
  ('school_admin', 'school.manage'),
  ('school_admin', 'campus.read'),
  ('school_admin', 'campus.manage'),
  ('school_admin', 'attendance.read'),
  ('school_admin', 'attendance.record'),
  ('school_admin', 'marks.read'),
  ('school_admin', 'marks.enter'),
  ('school_admin', 'results.publish'),
  ('school_admin', 'finance.read'),
  ('school_admin', 'payments.record'),
  ('school_admin', 'payments.adjust'),
  ('school_admin', 'reports.export'),
  ('principal', 'school.read'),
  ('principal', 'campus.read'),
  ('principal', 'attendance.read'),
  ('principal', 'marks.read'),
  ('principal', 'marks.enter'),
  ('principal', 'results.publish'),
  ('principal', 'finance.read'),
  ('principal', 'reports.export'),
  ('teacher', 'school.read'),
  ('teacher', 'campus.read'),
  ('teacher', 'attendance.read'),
  ('teacher', 'attendance.record'),
  ('teacher', 'marks.read'),
  ('teacher', 'marks.enter'),
  ('attendance_operator', 'school.read'),
  ('attendance_operator', 'campus.read'),
  ('attendance_operator', 'attendance.read'),
  ('attendance_operator', 'attendance.record'),
  ('finance_operator', 'school.read'),
  ('finance_operator', 'finance.read'),
  ('finance_operator', 'payments.record'),
  ('auditor', 'authorization.roles.read'),
  ('auditor', 'memberships.read'),
  ('auditor', 'school.read'),
  ('auditor', 'campus.read'),
  ('auditor', 'attendance.read'),
  ('auditor', 'marks.read'),
  ('auditor', 'finance.read')
) AS grant_template(role_key, permission_key)
  ON grant_template.role_key = role.system_key
ON CONFLICT (tenant_id, role_id, permission_key) DO NOTHING;
