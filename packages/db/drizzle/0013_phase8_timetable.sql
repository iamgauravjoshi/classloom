CREATE TABLE "weekly_timetable_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"timetable_id" uuid NOT NULL,
	"slot_id" uuid,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_timetable_events_type_check" CHECK ("weekly_timetable_events"."event_type" in ('created', 'slot_created', 'slot_updated', 'slot_deleted', 'published'))
);
--> statement-breakpoint
ALTER TABLE "weekly_timetable_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_timetable_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"timetable_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"teacher_assignment_id" uuid,
	"weekday" integer NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room_label" text,
	"demo_key" text,
	"created_by_account_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_account_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_timetable_slots_weekday_check" CHECK ("weekly_timetable_slots"."weekday" between 1 and 7),
	CONSTRAINT "weekly_timetable_slots_time_check" CHECK ("weekly_timetable_slots"."start_time" < "weekly_timetable_slots"."end_time")
);
--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "weekly_timetables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by_account_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"updated_by_account_id" uuid NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_timetables_tenant_school_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "weekly_timetables_scope_session_id_unique" UNIQUE("tenant_id","school_id","session_id","id"),
	CONSTRAINT "weekly_timetables_status_check" CHECK ("weekly_timetables"."status" in ('draft', 'published'))
);
--> statement-breakpoint
ALTER TABLE "weekly_timetables" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academic_teacher_assignments" ADD CONSTRAINT "academic_assignments_scope_id_unique" UNIQUE("tenant_id","school_id","session_id","id");--> statement-breakpoint
ALTER TABLE "weekly_timetable_events" ADD CONSTRAINT "weekly_timetable_events_timetable_fk" FOREIGN KEY ("tenant_id","school_id","timetable_id") REFERENCES "public"."weekly_timetables"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_events" ADD CONSTRAINT "weekly_timetable_events_actor_membership_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_events" ADD CONSTRAINT "weekly_timetable_events_actor_account_membership_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ADD CONSTRAINT "weekly_timetable_slots_parent_fk" FOREIGN KEY ("tenant_id","school_id","session_id","timetable_id") REFERENCES "public"."weekly_timetables"("tenant_id","school_id","session_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ADD CONSTRAINT "weekly_timetable_slots_section_fk" FOREIGN KEY ("tenant_id","school_id","session_id","section_id") REFERENCES "public"."academic_sections"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ADD CONSTRAINT "weekly_timetable_slots_subject_fk" FOREIGN KEY ("tenant_id","school_id","session_id","subject_id") REFERENCES "public"."academic_subjects"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ADD CONSTRAINT "weekly_timetable_slots_teacher_assignment_fk" FOREIGN KEY ("tenant_id","school_id","session_id","teacher_assignment_id") REFERENCES "public"."academic_teacher_assignments"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ADD CONSTRAINT "weekly_timetable_slots_created_by_actor_fk" FOREIGN KEY ("created_by_account_id","created_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetable_slots" ADD CONSTRAINT "weekly_timetable_slots_updated_by_actor_fk" FOREIGN KEY ("updated_by_account_id","updated_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetables" ADD CONSTRAINT "weekly_timetables_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetables" ADD CONSTRAINT "weekly_timetables_session_fk" FOREIGN KEY ("tenant_id","school_id","session_id") REFERENCES "public"."academic_sessions"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetables" ADD CONSTRAINT "weekly_timetables_created_by_actor_fk" FOREIGN KEY ("created_by_account_id","created_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_timetables" ADD CONSTRAINT "weekly_timetables_updated_by_actor_fk" FOREIGN KEY ("updated_by_account_id","updated_by_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_timetable_events_scope_id_unique" ON "weekly_timetable_events" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE INDEX "weekly_timetable_events_timetable_created_idx" ON "weekly_timetable_events" USING btree ("tenant_id","school_id","timetable_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_timetable_slots_scope_id_unique" ON "weekly_timetable_slots" USING btree ("tenant_id","school_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_timetable_slots_demo_key_unique" ON "weekly_timetable_slots" USING btree ("tenant_id","school_id","session_id",upper(trim("demo_key"))) WHERE "weekly_timetable_slots"."demo_key" is not null;--> statement-breakpoint
CREATE INDEX "weekly_timetable_slots_section_day_time_idx" ON "weekly_timetable_slots" USING btree ("tenant_id","school_id","session_id","section_id","weekday","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_timetables_session_unique" ON "weekly_timetables" USING btree ("tenant_id","school_id","session_id");--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "weekly_timetable_events" AS PERMISSIVE FOR ALL TO public USING ("weekly_timetable_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("weekly_timetable_events"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "weekly_timetable_slots" AS PERMISSIVE FOR ALL TO public USING ("weekly_timetable_slots"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("weekly_timetable_slots"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "weekly_timetables" AS PERMISSIVE FOR ALL TO public USING ("weekly_timetables"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("weekly_timetables"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE weekly_timetables FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE weekly_timetable_slots FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE weekly_timetable_events FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE weekly_timetables TO classloom_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE weekly_timetable_slots TO classloom_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE weekly_timetable_events TO classloom_runtime;
--> statement-breakpoint
INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES
  ('timetable.read', 'timetable', 'school', 'read', true),
  ('timetable.manage', 'timetable', 'school', 'manage', false)
ON CONFLICT (key) DO NOTHING;
--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT role.tenant_id, role.id, grant_template.permission_key
FROM authorization_roles AS role
JOIN (VALUES
  ('tenant_admin', 'timetable.read'), ('tenant_admin', 'timetable.manage'),
  ('school_admin', 'timetable.read'), ('school_admin', 'timetable.manage'),
  ('principal', 'timetable.read'), ('teacher', 'timetable.read'), ('auditor', 'timetable.read')
) AS grant_template(role_key, permission_key)
  ON grant_template.role_key = role.system_key
ON CONFLICT (tenant_id, role_id, permission_key) DO NOTHING;