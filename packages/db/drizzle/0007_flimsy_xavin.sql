CREATE TABLE "authorization_role_permissions" (
	"tenant_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorization_role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "authorization_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "authorization_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "membership_role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope_kind" text NOT NULL,
	"school_id" uuid,
	"campus_id" uuid,
	"created_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_role_assignments_grant_unique" UNIQUE NULLS NOT DISTINCT("tenant_id","membership_id","role_id","scope_kind","school_id","campus_id"),
	CONSTRAINT "membership_role_assignments_scope_shape_check" CHECK (
    (scope_kind = 'tenant' and school_id is null and campus_id is null)
    or (scope_kind = 'school' and school_id is not null and campus_id is null)
    or (scope_kind = 'campus' and school_id is not null and campus_id is not null)
  )
);
--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"scope_kind" text NOT NULL,
	"action" text NOT NULL,
	"read_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "authorization_roles_tenant_id_id_unique" ON "authorization_roles" USING btree ("tenant_id","id");
--> statement-breakpoint
ALTER TABLE "authorization_role_permissions" ADD CONSTRAINT "authorization_role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_role_permissions" ADD CONSTRAINT "authorization_role_permissions_tenant_role_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "public"."authorization_roles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorization_roles" ADD CONSTRAINT "authorization_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_tenant_membership_fk" FOREIGN KEY ("tenant_id","membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_tenant_role_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "public"."authorization_roles"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_tenant_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_role_assignments" ADD CONSTRAINT "membership_role_assignments_tenant_campus_fk" FOREIGN KEY ("tenant_id","school_id","campus_id") REFERENCES "public"."campuses"("tenant_id","school_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "authorization_role_permissions_unique" ON "authorization_role_permissions" USING btree ("tenant_id","role_id","permission_key");--> statement-breakpoint
CREATE UNIQUE INDEX "authorization_roles_tenant_key_unique" ON "authorization_roles" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "authorization_roles_tenant_system_key_unique" ON "authorization_roles" USING btree ("tenant_id","system_key") WHERE "authorization_roles"."system_key" is not null;--> statement-breakpoint
CREATE INDEX "membership_role_assignments_membership_idx" ON "membership_role_assignments" USING btree ("tenant_id","membership_id");--> statement-breakpoint
CREATE POLICY "authorization_role_permissions_tenant_isolation" ON "authorization_role_permissions" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "authorization_roles_tenant_isolation" ON "authorization_roles" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "membership_role_assignments_tenant_isolation" ON "membership_role_assignments" AS PERMISSIVE FOR ALL TO public USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "authorization_roles" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "authorization_role_permissions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "membership_role_assignments" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
GRANT SELECT ON TABLE permissions TO classloom_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE authorization_roles, authorization_role_permissions, membership_role_assignments TO classloom_runtime;
