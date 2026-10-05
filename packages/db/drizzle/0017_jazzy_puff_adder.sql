CREATE TABLE "exam_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"label" text NOT NULL,
	"assessment_date" date NOT NULL,
	"maximum_score" integer NOT NULL,
	"passing_score" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_assessments_scope_id" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "exam_assessments_exam_id" UNIQUE("tenant_id","school_id","exam_id","id"),
	CONSTRAINT "exam_assessments_scores_check" CHECK ("exam_assessments"."maximum_score" between 1 and 100000 and "exam_assessments"."passing_score" between 0 and "exam_assessments"."maximum_score"),
	CONSTRAINT "exam_assessments_status_check" CHECK ("exam_assessments"."status" in ('draft', 'submitted', 'locked')),
	CONSTRAINT "exam_assessments_version_check" CHECK ("exam_assessments"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "exam_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exam_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"mark_id" uuid NOT NULL,
	"base_revision" integer NOT NULL,
	"previous_status" text NOT NULL,
	"previous_score" integer,
	"proposed_status" text NOT NULL,
	"proposed_score" integer,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_by_account_id" uuid NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"decided_by_account_id" uuid,
	"decision_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_corrections_status_check" CHECK ("exam_corrections"."status" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "exam_corrections_proposal_check" CHECK (("exam_corrections"."proposed_status" = 'scored' and "exam_corrections"."proposed_score" is not null and "exam_corrections"."proposed_score" between 0 and 100000) or ("exam_corrections"."proposed_status" in ('absent', 'exempt') and "exam_corrections"."proposed_score" is null)),
	CONSTRAINT "exam_corrections_separation_check" CHECK ("exam_corrections"."decided_by_account_id" is null or "exam_corrections"."decided_by_account_id" <> "exam_corrections"."requested_by_account_id")
);
--> statement-breakpoint
ALTER TABLE "exam_corrections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exam_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"assessment_id" uuid,
	"event_type" text NOT NULL,
	"details" jsonb NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exam_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exam_marks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"assessment_id" uuid NOT NULL,
	"academic_enrollment_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"roll_number" text,
	"status" text DEFAULT 'unmarked' NOT NULL,
	"score" integer,
	"revision" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "exam_marks_scope_id" UNIQUE("tenant_id","school_id","assessment_id","id"),
	CONSTRAINT "exam_marks_score_check" CHECK (("exam_marks"."status" = 'scored' and "exam_marks"."score" is not null and "exam_marks"."score" between 0 and 100000) or ("exam_marks"."status" in ('unmarked', 'absent', 'exempt') and "exam_marks"."score" is null)),
	CONSTRAINT "exam_marks_revision_check" CHECK ("exam_marks"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "exam_marks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exams_scope_id" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "exams_academic_id" UNIQUE("tenant_id","school_id","session_id","class_id","id"),
	CONSTRAINT "exams_dates_check" CHECK ("exams"."end_date" >= "exams"."start_date"),
	CONSTRAINT "exams_status_check" CHECK ("exams"."status" in ('draft', 'open', 'completed')),
	CONSTRAINT "exams_version_check" CHECK ("exams"."version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "exam_assessments" ADD CONSTRAINT "exam_assessments_exam_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id","exam_id") REFERENCES "public"."exams"("tenant_id","school_id","session_id","class_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_assessments" ADD CONSTRAINT "exam_assessments_section_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id","section_id") REFERENCES "public"."academic_sections"("tenant_id","school_id","session_id","class_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_assessments" ADD CONSTRAINT "exam_assessments_subject_fk" FOREIGN KEY ("tenant_id","school_id","session_id","subject_id") REFERENCES "public"."academic_subjects"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_corrections" ADD CONSTRAINT "exam_corrections_mark_fk" FOREIGN KEY ("tenant_id","school_id","assessment_id","mark_id") REFERENCES "public"."exam_marks"("tenant_id","school_id","assessment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_corrections" ADD CONSTRAINT "exam_corrections_requester_membership_fk" FOREIGN KEY ("tenant_id","requested_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_corrections" ADD CONSTRAINT "exam_corrections_requester_fk" FOREIGN KEY ("requested_by_account_id","requested_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_exam_fk" FOREIGN KEY ("tenant_id","school_id","exam_id") REFERENCES "public"."exams"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_assessment_fk" FOREIGN KEY ("tenant_id","school_id","exam_id","assessment_id") REFERENCES "public"."exam_assessments"("tenant_id","school_id","exam_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_membership_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_events" ADD CONSTRAINT "exam_events_actor_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_assessment_fk" FOREIGN KEY ("tenant_id","school_id","assessment_id") REFERENCES "public"."exam_assessments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","academic_enrollment_id") REFERENCES "public"."student_academic_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_class_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id") REFERENCES "public"."academic_classes"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_assessments_label_unique" ON "exam_assessments" USING btree ("tenant_id","school_id","exam_id","section_id","subject_id",upper(trim("label")));--> statement-breakpoint
CREATE UNIQUE INDEX "exam_corrections_pending_unique" ON "exam_corrections" USING btree ("tenant_id","school_id","mark_id") WHERE "exam_corrections"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "exam_events_history_idx" ON "exam_events" USING btree ("tenant_id","school_id","exam_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "exam_marks_roster_unique" ON "exam_marks" USING btree ("tenant_id","school_id","assessment_id","academic_enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exams_name_unique" ON "exams" USING btree ("tenant_id","school_id","session_id","class_id",upper(trim("name")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "exam_assessments" AS PERMISSIVE FOR ALL TO public USING ("exam_assessments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("exam_assessments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "exam_corrections" AS PERMISSIVE FOR ALL TO public USING ("exam_corrections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("exam_corrections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "exam_events" AS PERMISSIVE FOR ALL TO public USING ("exam_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("exam_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "exam_marks" AS PERMISSIVE FOR ALL TO public USING ("exam_marks"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("exam_marks"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "exams" AS PERMISSIVE FOR ALL TO public USING ("exams"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("exams"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE exams FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exam_assessments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exam_marks FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exam_corrections FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE exam_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON exams, exam_assessments, exam_marks, exam_corrections TO classloom_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON exam_events TO classloom_runtime;--> statement-breakpoint
UPDATE permissions SET scope_kind = 'school' WHERE key IN ('marks.read', 'marks.enter');--> statement-breakpoint
INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES
  ('exams.manage', 'exams', 'school', 'manage', false), ('marks.approve', 'marks', 'school', 'approve', false)
ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT r.tenant_id, r.id, p.key FROM authorization_roles r CROSS JOIN permissions p
WHERE r.system_key IN ('tenant_admin', 'school_admin', 'principal') AND p.key IN ('exams.manage', 'marks.approve')
ON CONFLICT DO NOTHING;
