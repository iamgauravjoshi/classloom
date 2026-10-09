CREATE TABLE "result_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"grading_policy_id" uuid NOT NULL,
	"edition" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"source_fingerprint" text NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"prepared_by_account_id" uuid NOT NULL,
	"prepared_by_membership_id" uuid NOT NULL,
	"submitted_by_account_id" uuid,
	"submitted_by_membership_id" uuid,
	"approved_by_account_id" uuid,
	"approved_by_membership_id" uuid,
	"published_by_account_id" uuid,
	"published_by_membership_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_batches_scope_id" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "result_batches_academic_id" UNIQUE("tenant_id","school_id","session_id","class_id","id"),
	CONSTRAINT "result_batches_edition_unique" UNIQUE("tenant_id","school_id","exam_id","edition"),
	CONSTRAINT "result_batches_idempotency_unique" UNIQUE("tenant_id","school_id","idempotency_key"),
	CONSTRAINT "result_batches_bounds" CHECK ("result_batches"."edition" > 0 and "result_batches"."version" >= 0),
	CONSTRAINT "result_batches_status" CHECK ("result_batches"."status" in ('draft','submitted','approved','published','superseded','withdrawn')),
	CONSTRAINT "result_batches_separation" CHECK ("result_batches"."approved_by_account_id" is null or ("result_batches"."approved_by_account_id" <> "result_batches"."prepared_by_account_id" and "result_batches"."approved_by_account_id" <> "result_batches"."submitted_by_account_id"))
);
--> statement-breakpoint
ALTER TABLE "result_batches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "result_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"batch_id" uuid,
	"policy_id" uuid,
	"event_type" text NOT NULL,
	"details" jsonb NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "result_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "result_grading_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"revision" integer NOT NULL,
	"bands" jsonb NOT NULL,
	"overall_passing_percentage" integer NOT NULL,
	"require_subject_pass" boolean NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "result_policies_scope_id" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "result_policies_idempotency_unique" UNIQUE("tenant_id","school_id","idempotency_key"),
	CONSTRAINT "result_policies_bounds" CHECK ("result_grading_policies"."revision" > 0 and "result_grading_policies"."overall_passing_percentage" between 0 and 10000 and jsonb_array_length("result_grading_policies"."bands") between 2 and 20)
);
--> statement-breakpoint
ALTER TABLE "result_grading_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "result_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"remarks" text,
	CONSTRAINT "result_reports_scope_id" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "result_reports_roster_unique" UNIQUE("tenant_id","school_id","batch_id","section_id","student_id"),
	CONSTRAINT "result_reports_remarks" CHECK ("result_reports"."remarks" is null or length("result_reports"."remarks") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "result_reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_exam_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id","exam_id") REFERENCES "public"."exams"("tenant_id","school_id","session_id","class_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_policy_fk" FOREIGN KEY ("tenant_id","school_id","grading_policy_id") REFERENCES "public"."result_grading_policies"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_prepared_member_fk" FOREIGN KEY ("tenant_id","prepared_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_prepared_actor_fk" FOREIGN KEY ("prepared_by_account_id","prepared_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_submitted_member_fk" FOREIGN KEY ("tenant_id","submitted_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_submitted_actor_fk" FOREIGN KEY ("submitted_by_account_id","submitted_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_approved_member_fk" FOREIGN KEY ("tenant_id","approved_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_approved_actor_fk" FOREIGN KEY ("approved_by_account_id","approved_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_published_member_fk" FOREIGN KEY ("tenant_id","published_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_batches" ADD CONSTRAINT "result_batches_published_actor_fk" FOREIGN KEY ("published_by_account_id","published_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_events" ADD CONSTRAINT "result_events_batch_fk" FOREIGN KEY ("tenant_id","school_id","batch_id") REFERENCES "public"."result_batches"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_events" ADD CONSTRAINT "result_events_policy_fk" FOREIGN KEY ("tenant_id","school_id","policy_id") REFERENCES "public"."result_grading_policies"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_events" ADD CONSTRAINT "result_events_member_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_events" ADD CONSTRAINT "result_events_actor_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_grading_policies" ADD CONSTRAINT "result_policies_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_grading_policies" ADD CONSTRAINT "result_policies_member_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_grading_policies" ADD CONSTRAINT "result_policies_actor_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_reports" ADD CONSTRAINT "result_reports_batch_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id","batch_id") REFERENCES "public"."result_batches"("tenant_id","school_id","session_id","class_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_reports" ADD CONSTRAINT "result_reports_section_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id","section_id") REFERENCES "public"."academic_sections"("tenant_id","school_id","session_id","class_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_reports" ADD CONSTRAINT "result_reports_student_fk" FOREIGN KEY ("tenant_id","school_id","student_id","school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","student_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "result_batches_published_unique" ON "result_batches" USING btree ("tenant_id","school_id","exam_id") WHERE "result_batches"."status" = 'published';--> statement-breakpoint
CREATE INDEX "result_events_history_idx" ON "result_events" USING btree ("tenant_id","school_id","batch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "result_policies_revision_unique" ON "result_grading_policies" USING btree ("tenant_id","school_id",lower(trim("name")),"revision");--> statement-breakpoint
CREATE INDEX "result_reports_person_idx" ON "result_reports" USING btree ("tenant_id","student_id","batch_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "result_batches" AS PERMISSIVE FOR ALL TO public USING ("result_batches"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("result_batches"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "result_events" AS PERMISSIVE FOR ALL TO public USING ("result_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("result_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "result_grading_policies" AS PERMISSIVE FOR ALL TO public USING ("result_grading_policies"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("result_grading_policies"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "result_reports" AS PERMISSIVE FOR ALL TO public USING ("result_reports"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("result_reports"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE result_grading_policies FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE result_batches FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE result_reports FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE result_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON result_grading_policies, result_events TO classloom_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON result_batches, result_reports TO classloom_runtime;--> statement-breakpoint
CREATE FUNCTION protect_result_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id,NEW.school_id,NEW.batch_id,NEW.student_id,NEW.section_id,NEW.school_enrollment_id,NEW.session_id,NEW.class_id,NEW.id) IS DISTINCT FROM (OLD.tenant_id,OLD.school_id,OLD.batch_id,OLD.student_id,OLD.section_id,OLD.school_enrollment_id,OLD.session_id,OLD.class_id,OLD.id) THEN
    RAISE EXCEPTION 'Report identity cannot be changed' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM result_batches WHERE tenant_id = NEW.tenant_id AND school_id = NEW.school_id AND id = NEW.batch_id AND status = 'draft' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only draft reports may be written' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER result_reports_draft_only BEFORE INSERT OR UPDATE ON result_reports FOR EACH ROW EXECUTE FUNCTION protect_result_report();--> statement-breakpoint
UPDATE permissions SET scope_kind = 'school' WHERE key = 'results.publish';--> statement-breakpoint
INSERT INTO permissions (key,family,scope_kind,action,read_only) VALUES
 ('results.read','results','school','read',true),('results.manage','results','school','manage',false),('results.approve','results','school','approve',false),('results.export','results','school','export',false)
ON CONFLICT(key) DO NOTHING;--> statement-breakpoint
INSERT INTO authorization_role_permissions(tenant_id,role_id,permission_key)
SELECT r.tenant_id,r.id,p.key FROM authorization_roles r CROSS JOIN permissions p
WHERE (r.system_key IN ('tenant_admin','school_admin','principal') AND p.family = 'results') OR (r.system_key = 'auditor' AND p.key = 'results.read')
ON CONFLICT DO NOTHING;
