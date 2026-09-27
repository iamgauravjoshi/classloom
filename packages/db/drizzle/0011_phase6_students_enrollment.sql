CREATE TABLE "guardian_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"guardian_code" text NOT NULL,
	"given_name" text NOT NULL,
	"middle_name" text,
	"family_name" text NOT NULL,
	"preferred_name" text,
	"email" text,
	"phone" text,
	"occupation" text,
	"address_line_1" text,
	"address_line_2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country_code" text,
	"status" text DEFAULT 'active' NOT NULL,
	"membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guardian_profiles_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "guardian_profiles_status_check" CHECK ("guardian_profiles"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "guardian_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_academic_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"roll_number" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_academic_enrollments_status_check" CHECK ("student_academic_enrollments"."status" in ('active', 'transferred', 'withdrawn', 'completed')),
	CONSTRAINT "student_academic_enrollments_dates_check" CHECK ("student_academic_enrollments"."end_date" is null or "student_academic_enrollments"."end_date" >= "student_academic_enrollments"."start_date")
);
--> statement-breakpoint
ALTER TABLE "student_academic_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_guardian_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid NOT NULL,
	"relationship_type" text NOT NULL,
	"primary_contact" boolean DEFAULT false NOT NULL,
	"emergency_contact" boolean DEFAULT false NOT NULL,
	"authorized_pickup" boolean DEFAULT false NOT NULL,
	"financial_responsibility" boolean DEFAULT false NOT NULL,
	"portal_access" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_guardian_relationships_type_check" CHECK ("student_guardian_relationships"."relationship_type" in ('mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other')),
	CONSTRAINT "student_guardian_relationships_status_check" CHECK ("student_guardian_relationships"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "student_guardian_relationships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_checksum" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"student_count" integer DEFAULT 0 NOT NULL,
	"guardian_count" integer DEFAULT 0 NOT NULL,
	"enrollment_count" integer DEFAULT 0 NOT NULL,
	"failure_category" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_import_batches_status_check" CHECK ("student_import_batches"."status" in ('processing', 'completed', 'failed')),
	CONSTRAINT "student_import_batches_checksum_check" CHECK (length("student_import_batches"."payload_checksum") = 64)
);
--> statement-breakpoint
ALTER TABLE "student_import_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"student_code" text NOT NULL,
	"given_name" text NOT NULL,
	"middle_name" text,
	"family_name" text NOT NULL,
	"preferred_name" text,
	"date_of_birth" date NOT NULL,
	"gender" text,
	"email" text,
	"phone" text,
	"status" text DEFAULT 'active' NOT NULL,
	"membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_profiles_tenant_id_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "student_profiles_status_check" CHECK ("student_profiles"."status" in ('active', 'inactive'))
);
--> statement-breakpoint
ALTER TABLE "student_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "student_school_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"admission_number" text NOT NULL,
	"admission_date" date NOT NULL,
	"leaving_date" date,
	"leaving_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "student_school_enrollments_student_scope_id_unique" UNIQUE("tenant_id","school_id","student_id","id"),
	CONSTRAINT "student_school_enrollments_status_check" CHECK ("student_school_enrollments"."status" in ('active', 'withdrawn', 'transferred', 'completed')),
	CONSTRAINT "student_school_enrollments_dates_check" CHECK ("student_school_enrollments"."leaving_date" is null or "student_school_enrollments"."leaving_date" >= "student_school_enrollments"."admission_date")
);
--> statement-breakpoint
ALTER TABLE "student_school_enrollments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardian_profiles" ADD CONSTRAINT "guardian_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_profiles" ADD CONSTRAINT "guardian_profiles_tenant_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_scope_class_id_unique" UNIQUE("tenant_id","school_id","session_id","class_id","id");--> statement-breakpoint
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_school_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","student_id","school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","student_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_academic_enrollments" ADD CONSTRAINT "student_academic_enrollments_section_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id","section_id") REFERENCES "public"."academic_sections"("tenant_id","school_id","session_id","class_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_relationships" ADD CONSTRAINT "student_guardian_relationships_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."student_profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_guardian_relationships" ADD CONSTRAINT "student_guardian_relationships_guardian_fk" FOREIGN KEY ("tenant_id","guardian_id") REFERENCES "public"."guardian_profiles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_import_batches" ADD CONSTRAINT "student_import_batches_actor_account_id_accounts_id_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_import_batches" ADD CONSTRAINT "student_import_batches_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_tenant_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_school_enrollments" ADD CONSTRAINT "student_school_enrollments_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_school_enrollments" ADD CONSTRAINT "student_school_enrollments_student_fk" FOREIGN KEY ("tenant_id","student_id") REFERENCES "public"."student_profiles"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_profiles_tenant_code_unique" ON "guardian_profiles" USING btree ("tenant_id",upper(trim("guardian_code")));--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_profiles_tenant_membership_unique" ON "guardian_profiles" USING btree ("tenant_id","membership_id") WHERE "guardian_profiles"."membership_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "student_academic_enrollments_scope_id_unique" ON "student_academic_enrollments" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_academic_enrollments_one_active_unique" ON "student_academic_enrollments" USING btree ("tenant_id","school_id","student_id","session_id") WHERE "student_academic_enrollments"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "student_academic_enrollments_active_roll_unique" ON "student_academic_enrollments" USING btree ("tenant_id","school_id","session_id","section_id",upper(trim("roll_number"))) WHERE "student_academic_enrollments"."status" = 'active' and "student_academic_enrollments"."roll_number" is not null;--> statement-breakpoint
CREATE INDEX "student_academic_enrollments_student_history_idx" ON "student_academic_enrollments" USING btree ("tenant_id","school_id","student_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardian_relationships_tenant_id_id_unique" ON "student_guardian_relationships" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_guardian_relationships_pair_unique" ON "student_guardian_relationships" USING btree ("tenant_id","student_id","guardian_id");--> statement-breakpoint
CREATE INDEX "student_guardian_relationships_guardian_status_idx" ON "student_guardian_relationships" USING btree ("tenant_id","guardian_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "student_import_batches_scope_id_unique" ON "student_import_batches" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_import_batches_idempotency_unique" ON "student_import_batches" USING btree ("tenant_id","school_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_tenant_code_unique" ON "student_profiles" USING btree ("tenant_id",upper(trim("student_code")));--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_tenant_membership_unique" ON "student_profiles" USING btree ("tenant_id","membership_id") WHERE "student_profiles"."membership_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "student_school_enrollments_scope_id_unique" ON "student_school_enrollments" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_school_enrollments_admission_unique" ON "student_school_enrollments" USING btree ("tenant_id","school_id",upper(trim("admission_number")));--> statement-breakpoint
CREATE UNIQUE INDEX "student_school_enrollments_one_active_unique" ON "student_school_enrollments" USING btree ("tenant_id","school_id","student_id") WHERE "student_school_enrollments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "student_school_enrollments_school_status_idx" ON "student_school_enrollments" USING btree ("tenant_id","school_id","status");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "guardian_profiles" AS PERMISSIVE FOR ALL TO public USING ("guardian_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("guardian_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "student_academic_enrollments" AS PERMISSIVE FOR ALL TO public USING ("student_academic_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("student_academic_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "student_guardian_relationships" AS PERMISSIVE FOR ALL TO public USING ("student_guardian_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("student_guardian_relationships"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "student_import_batches" AS PERMISSIVE FOR ALL TO public USING ("student_import_batches"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("student_import_batches"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "student_profiles" AS PERMISSIVE FOR ALL TO public USING ("student_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("student_profiles"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "student_school_enrollments" AS PERMISSIVE FOR ALL TO public USING ("student_school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("student_school_enrollments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "student_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "guardian_profiles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_guardian_relationships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_school_enrollments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_academic_enrollments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "student_import_batches" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  student_profiles, guardian_profiles, student_guardian_relationships,
  student_school_enrollments, student_academic_enrollments, student_import_batches
TO classloom_runtime;
--> statement-breakpoint
INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES
  ('student.read', 'student', 'school', 'read', true),
  ('student.manage', 'student', 'school', 'manage', false),
  ('guardian.read', 'guardian', 'school', 'read', true),
  ('guardian.manage', 'guardian', 'school', 'manage', false),
  ('enrollment.read', 'enrollment', 'school', 'read', true),
  ('enrollment.manage', 'enrollment', 'school', 'manage', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT role.tenant_id, role.id, grant_template.permission_key
FROM authorization_roles AS role
JOIN (VALUES
  ('tenant_admin', 'student.read'), ('tenant_admin', 'student.manage'),
  ('tenant_admin', 'guardian.read'), ('tenant_admin', 'guardian.manage'),
  ('tenant_admin', 'enrollment.read'), ('tenant_admin', 'enrollment.manage'),
  ('school_admin', 'student.read'), ('school_admin', 'student.manage'),
  ('school_admin', 'guardian.read'), ('school_admin', 'guardian.manage'),
  ('school_admin', 'enrollment.read'), ('school_admin', 'enrollment.manage'),
  ('principal', 'student.read'), ('principal', 'guardian.read'), ('principal', 'enrollment.read'),
  ('auditor', 'student.read'), ('auditor', 'guardian.read'), ('auditor', 'enrollment.read')
) AS grant_template(role_key, permission_key)
  ON grant_template.role_key = role.system_key
ON CONFLICT (tenant_id, role_id, permission_key) DO NOTHING;
