CREATE TABLE "academic_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academic_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_sections_capacity_check" CHECK ("academic_sections"."capacity" is null or "academic_sections"."capacity" > 0)
);
--> statement-breakpoint
ALTER TABLE "academic_sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academic_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "academic_sessions_dates_check" CHECK ("academic_sessions"."end_date" > "academic_sessions"."start_date"),
	CONSTRAINT "academic_sessions_status_check" CHECK ("academic_sessions"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "academic_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academic_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_subjects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "academic_teacher_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "academic_teacher_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_classes_scope_id_unique" ON "academic_classes" USING btree ("tenant_id","school_id","session_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_classes_session_code_unique" ON "academic_classes" USING btree ("tenant_id","school_id","session_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sections_scope_id_unique" ON "academic_sections" USING btree ("tenant_id","school_id","session_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sections_class_code_unique" ON "academic_sections" USING btree ("tenant_id","school_id","session_id","class_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_tenant_school_id_unique" ON "academic_sessions" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_school_code_unique" ON "academic_sessions" USING btree ("tenant_id","school_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_sessions_one_active_unique" ON "academic_sessions" USING btree ("tenant_id","school_id") WHERE "academic_sessions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "academic_subjects_scope_id_unique" ON "academic_subjects" USING btree ("tenant_id","school_id","session_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_subjects_session_code_unique" ON "academic_subjects" USING btree ("tenant_id","school_id","session_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_assignments_section_subject_unique" ON "academic_teacher_assignments" USING btree ("tenant_id","school_id","session_id","section_id","subject_id");--> statement-breakpoint
ALTER TABLE "academic_classes" ADD CONSTRAINT "academic_classes_session_fk" FOREIGN KEY ("tenant_id","school_id","session_id") REFERENCES "public"."academic_sessions"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_sections" ADD CONSTRAINT "academic_sections_class_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id") REFERENCES "public"."academic_classes"("tenant_id","school_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_sessions" ADD CONSTRAINT "academic_sessions_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_subjects" ADD CONSTRAINT "academic_subjects_session_fk" FOREIGN KEY ("tenant_id","school_id","session_id") REFERENCES "public"."academic_sessions"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_teacher_assignments" ADD CONSTRAINT "academic_assignments_section_fk" FOREIGN KEY ("tenant_id","school_id","session_id","section_id") REFERENCES "public"."academic_sections"("tenant_id","school_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_teacher_assignments" ADD CONSTRAINT "academic_assignments_subject_fk" FOREIGN KEY ("tenant_id","school_id","session_id","subject_id") REFERENCES "public"."academic_subjects"("tenant_id","school_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_teacher_assignments" ADD CONSTRAINT "academic_assignments_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "academic_classes" AS PERMISSIVE FOR ALL TO public USING ("academic_classes"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academic_classes"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "academic_sections" AS PERMISSIVE FOR ALL TO public USING ("academic_sections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academic_sections"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "academic_sessions" AS PERMISSIVE FOR ALL TO public USING ("academic_sessions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academic_sessions"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "academic_subjects" AS PERMISSIVE FOR ALL TO public USING ("academic_subjects"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academic_subjects"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "academic_teacher_assignments" AS PERMISSIVE FOR ALL TO public USING ("academic_teacher_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("academic_teacher_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE academic_sessions, academic_classes, academic_sections, academic_subjects, academic_teacher_assignments TO classloom_runtime;
