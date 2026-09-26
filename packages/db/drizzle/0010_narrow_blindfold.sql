CREATE TABLE "staff_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_code" text NOT NULL,
	"given_name" text NOT NULL,
	"family_name" text NOT NULL,
	"preferred_name" text,
	"work_email" text,
	"phone" text,
	"membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "staff_school_affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"staff_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"designation" text NOT NULL,
	"start_date" date,
	"kind" text DEFAULT 'staff' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_affiliations_kind_check" CHECK ("staff_school_affiliations"."kind" in ('staff', 'teacher')),
	CONSTRAINT "staff_affiliations_status_check" CHECK ("staff_school_affiliations"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "staff_school_affiliations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teacher_profiles" (
	"staff_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"qualification" text,
	"specialization" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teacher_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_tenant_id_id_unique" ON "staff_profiles" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_tenant_code_unique" ON "staff_profiles" USING btree ("tenant_id",upper(trim("staff_code")));--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_tenant_membership_unique" ON "staff_profiles" USING btree ("tenant_id","membership_id") WHERE "staff_profiles"."membership_id" is not null;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_tenant_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_school_affiliations" ADD CONSTRAINT "staff_affiliations_tenant_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff_profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_school_affiliations" ADD CONSTRAINT "staff_affiliations_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_tenant_staff_fk" FOREIGN KEY ("tenant_id","staff_id") REFERENCES "public"."staff_profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_affiliations_tenant_staff_school_unique" ON "staff_school_affiliations" USING btree ("tenant_id","staff_id","school_id");--> statement-breakpoint
CREATE INDEX "staff_affiliations_school_status_idx" ON "staff_school_affiliations" USING btree ("tenant_id","school_id","status");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "staff_profiles" AS PERMISSIVE FOR ALL TO public USING ("staff_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("staff_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "staff_school_affiliations" AS PERMISSIVE FOR ALL TO public USING ("staff_school_affiliations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("staff_school_affiliations"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "teacher_profiles" AS PERMISSIVE FOR ALL TO public USING ("teacher_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("teacher_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "staff_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "staff_school_affiliations" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "teacher_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE staff_profiles, staff_school_affiliations, teacher_profiles TO classloom_runtime;
--> statement-breakpoint
INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES
  ('staff.read', 'staff', 'school', 'read', true),
  ('staff.manage', 'staff', 'school', 'manage', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT role.tenant_id, role.id, grant_template.permission_key
FROM authorization_roles AS role
JOIN (VALUES
  ('tenant_admin', 'staff.read'),
  ('tenant_admin', 'staff.manage'),
  ('school_admin', 'staff.read'),
  ('school_admin', 'staff.manage'),
  ('principal', 'staff.read'),
  ('auditor', 'staff.read')
) AS grant_template(role_key, permission_key)
  ON grant_template.role_key = role.system_key
ON CONFLICT (tenant_id, role_id, permission_key) DO NOTHING;
