CREATE TABLE "daily_attendance_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"academic_enrollment_id" uuid NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_attendance_entries_scope_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "daily_attendance_entries_register_enrollment_unique" UNIQUE("tenant_id","school_id","register_id","academic_enrollment_id"),
	CONSTRAINT "daily_attendance_entries_status_check" CHECK ("daily_attendance_entries"."status" in ('present', 'absent', 'late', 'excused'))
);
--> statement-breakpoint
ALTER TABLE "daily_attendance_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"academic_enrollment_id" uuid NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"previous_status" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_attendance_events_status_check" CHECK ("daily_attendance_events"."status" in ('present', 'absent', 'late', 'excused')),
	CONSTRAINT "daily_attendance_events_previous_status_check" CHECK ("daily_attendance_events"."previous_status" is null or "daily_attendance_events"."previous_status" in ('present', 'absent', 'late', 'excused'))
);
--> statement-breakpoint
ALTER TABLE "daily_attendance_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "daily_attendance_registers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"attendance_date" date NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_account_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_attendance_registers_scope_id_unique" UNIQUE("tenant_id","school_id","id")
);
--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "daily_attendance_entries" ADD CONSTRAINT "daily_attendance_entries_register_fk" FOREIGN KEY ("tenant_id","school_id","register_id") REFERENCES "public"."daily_attendance_registers"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_entries" ADD CONSTRAINT "daily_attendance_entries_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","academic_enrollment_id") REFERENCES "public"."student_academic_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_events" ADD CONSTRAINT "daily_attendance_events_register_fk" FOREIGN KEY ("tenant_id","school_id","register_id") REFERENCES "public"."daily_attendance_registers"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_events" ADD CONSTRAINT "daily_attendance_events_entry_fk" FOREIGN KEY ("tenant_id","school_id","register_id","academic_enrollment_id") REFERENCES "public"."daily_attendance_entries"("tenant_id","school_id","register_id","academic_enrollment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_events" ADD CONSTRAINT "daily_attendance_events_actor_membership_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_events" ADD CONSTRAINT "daily_attendance_events_actor_account_membership_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_session_fk" FOREIGN KEY ("tenant_id","school_id","session_id") REFERENCES "public"."academic_sessions"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_section_fk" FOREIGN KEY ("tenant_id","school_id","session_id","section_id") REFERENCES "public"."academic_sections"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_created_membership_fk" FOREIGN KEY ("tenant_id","created_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_updated_membership_fk" FOREIGN KEY ("tenant_id","updated_by_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_created_actor_fk" FOREIGN KEY ("created_by_account_id","created_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_attendance_registers" ADD CONSTRAINT "daily_attendance_registers_updated_actor_fk" FOREIGN KEY ("updated_by_account_id","updated_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_attendance_entries_enrollment_idx" ON "daily_attendance_entries" USING btree ("tenant_id","school_id","academic_enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_attendance_events_scope_id_unique" ON "daily_attendance_events" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE INDEX "daily_attendance_events_register_created_idx" ON "daily_attendance_events" USING btree ("tenant_id","school_id","register_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_attendance_registers_daily_unique" ON "daily_attendance_registers" USING btree ("tenant_id","school_id","session_id","section_id","attendance_date");--> statement-breakpoint
CREATE INDEX "daily_attendance_registers_date_section_idx" ON "daily_attendance_registers" USING btree ("tenant_id","school_id","attendance_date","session_id","section_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "daily_attendance_entries" AS PERMISSIVE FOR ALL TO public USING ("daily_attendance_entries"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("daily_attendance_entries"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "daily_attendance_events" AS PERMISSIVE FOR ALL TO public USING ("daily_attendance_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("daily_attendance_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "daily_attendance_registers" AS PERMISSIVE FOR ALL TO public USING ("daily_attendance_registers"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("daily_attendance_registers"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE daily_attendance_registers FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE daily_attendance_entries FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE daily_attendance_events FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE daily_attendance_registers TO classloom_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE daily_attendance_entries TO classloom_runtime;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE daily_attendance_events TO classloom_runtime;--> statement-breakpoint
UPDATE permissions SET scope_kind = 'school' WHERE key IN ('attendance.read', 'attendance.record');
