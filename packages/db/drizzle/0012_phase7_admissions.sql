CREATE TABLE "admission_case_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_case_events_to_status_check" CHECK ("admission_case_events"."to_status" in ('enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted')),
	CONSTRAINT "admission_case_events_from_status_check" CHECK ("admission_case_events"."from_status" is null or "admission_case_events"."from_status" in ('enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted'))
);
--> statement-breakpoint
ALTER TABLE "admission_case_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admission_case_guardians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"guardian_profile_id" uuid,
	"guardian_code" text,
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
	"relationship_type" text NOT NULL,
	"primary_contact" boolean DEFAULT false NOT NULL,
	"emergency_contact" boolean DEFAULT false NOT NULL,
	"authorized_pickup" boolean DEFAULT false NOT NULL,
	"financial_responsibility" boolean DEFAULT false NOT NULL,
	"portal_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_case_guardians_ordinal_check" CHECK ("admission_case_guardians"."ordinal" between 1 and 10),
	CONSTRAINT "admission_case_guardians_relationship_type_check" CHECK ("admission_case_guardians"."relationship_type" in ('mother', 'father', 'legal_guardian', 'grandparent', 'sibling', 'other'))
);
--> statement-breakpoint
ALTER TABLE "admission_case_guardians" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "admission_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"case_reference" text NOT NULL,
	"status" text DEFAULT 'enquiry' NOT NULL,
	"student_given_name" text,
	"student_middle_name" text,
	"student_family_name" text,
	"student_preferred_name" text,
	"student_date_of_birth" date,
	"student_gender" text,
	"student_email" text,
	"student_phone" text,
	"existing_student_id" uuid,
	"requested_session_id" uuid,
	"requested_class_id" uuid,
	"requested_section_id" uuid,
	"review_note" text,
	"decision_note" text,
	"converted_student_id" uuid,
	"converted_school_enrollment_id" uuid,
	"converted_academic_enrollment_id" uuid,
	"created_by_account_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admission_cases_status_check" CHECK ("admission_cases"."status" in ('enquiry', 'draft', 'submitted', 'under_review', 'accepted', 'rejected', 'withdrawn', 'admitted')),
	CONSTRAINT "admission_cases_tenant_school_id_unique" UNIQUE("tenant_id","school_id","id")
);
--> statement-breakpoint
ALTER TABLE "admission_cases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admission_case_events" ADD CONSTRAINT "admission_case_events_case_fk" FOREIGN KEY ("tenant_id","school_id","case_id") REFERENCES "public"."admission_cases"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_case_events" ADD CONSTRAINT "admission_case_events_actor_membership_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_case_events" ADD CONSTRAINT "admission_case_events_actor_account_membership_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_case_events" ADD CONSTRAINT "admission_case_events_actor_account_fk" FOREIGN KEY ("actor_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_case_guardians" ADD CONSTRAINT "admission_case_guardians_case_fk" FOREIGN KEY ("tenant_id","school_id","case_id") REFERENCES "public"."admission_cases"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_case_guardians" ADD CONSTRAINT "admission_case_guardians_guardian_fk" FOREIGN KEY ("tenant_id","guardian_profile_id") REFERENCES "public"."guardian_profiles"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_existing_student_fk" FOREIGN KEY ("tenant_id","existing_student_id") REFERENCES "public"."student_profiles"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_converted_student_fk" FOREIGN KEY ("tenant_id","converted_student_id") REFERENCES "public"."student_profiles"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_converted_school_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","converted_school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_converted_academic_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","converted_academic_enrollment_id") REFERENCES "public"."student_academic_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_created_by_membership_fk" FOREIGN KEY ("tenant_id","created_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_created_by_account_membership_fk" FOREIGN KEY ("created_by_account_id","created_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admission_cases" ADD CONSTRAINT "admission_cases_created_by_account_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admission_case_events_tenant_school_id_unique" ON "admission_case_events" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE INDEX "admission_case_events_case_created_idx" ON "admission_case_events" USING btree ("tenant_id","school_id","case_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_case_guardians_tenant_school_id_unique" ON "admission_case_guardians" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_case_guardians_case_ordinal_unique" ON "admission_case_guardians" USING btree ("tenant_id","school_id","case_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "admission_cases_school_reference_unique" ON "admission_cases" USING btree ("tenant_id","school_id",upper(trim("case_reference")));--> statement-breakpoint
CREATE INDEX "admission_cases_school_status_created_idx" ON "admission_cases" USING btree ("tenant_id","school_id","status","created_at","id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "admission_case_events" AS PERMISSIVE FOR ALL TO public USING ("admission_case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("admission_case_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "admission_case_guardians" AS PERMISSIVE FOR ALL TO public USING ("admission_case_guardians"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("admission_case_guardians"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "admission_cases" AS PERMISSIVE FOR ALL TO public USING ("admission_cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("admission_cases"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "admission_cases" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admission_case_guardians" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "admission_case_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE admission_cases TO classloom_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE admission_case_guardians TO classloom_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE admission_case_events TO classloom_runtime;
--> statement-breakpoint
INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES
  ('admissions.read', 'admissions', 'school', 'read', true),
  ('admissions.manage', 'admissions', 'school', 'manage', false),
  ('admissions.convert', 'admissions', 'school', 'convert', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_roles (tenant_id, key, name, system_key)
SELECT tenants.id, role_template.key, role_template.name, role_template.key
FROM tenants
CROSS JOIN (VALUES ('admission_officer', 'Admission Officer')) AS role_template(key, name)
ON CONFLICT (tenant_id, system_key) WHERE system_key IS NOT NULL DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT role.tenant_id, role.id, grant_template.permission_key
FROM authorization_roles AS role
JOIN (VALUES
  ('tenant_admin', 'admissions.read'), ('tenant_admin', 'admissions.manage'), ('tenant_admin', 'admissions.convert'),
  ('school_admin', 'admissions.read'), ('school_admin', 'admissions.manage'), ('school_admin', 'admissions.convert'),
  ('principal', 'admissions.read'),
  ('auditor', 'admissions.read'),
  ('admission_officer', 'admissions.read'), ('admission_officer', 'admissions.manage'), ('admission_officer', 'admissions.convert')
) AS grant_template(role_key, permission_key)
  ON grant_template.role_key = role.system_key
ON CONFLICT (tenant_id, role_id, permission_key) DO NOTHING;
