CREATE TABLE "fee_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_assignments_scope_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "fee_assignments_plan_enrollment_scope_id_unique" UNIQUE("tenant_id","school_id","plan_id","school_enrollment_id","id")
);
--> statement-breakpoint
ALTER TABLE "fee_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"assignment_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_line_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"description" text NOT NULL,
	"currency" text NOT NULL,
	"due_date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_charges_scope_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "fee_charges_enrollment_scope_id_unique" UNIQUE("tenant_id","school_id","school_enrollment_id","id"),
	CONSTRAINT "fee_charges_amount_check" CHECK ("fee_charges"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "fee_charges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_heads_scope_id_unique" UNIQUE("tenant_id","school_id","id")
);
--> statement-breakpoint
ALTER TABLE "fee_heads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"payment_id" uuid,
	"kind" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"reason" text,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_ledger_entries_scope_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "fee_ledger_entries_kind_check" CHECK ("fee_ledger_entries"."kind" in ('charge', 'concession', 'payment', 'payment_reversal')),
	CONSTRAINT "fee_ledger_entries_amount_check" CHECK ("fee_ledger_entries"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "fee_ledger_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"school_enrollment_id" uuid NOT NULL,
	"receipt_number" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"amount_minor" bigint NOT NULL,
	"actor_account_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_payments_scope_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "fee_payments_enrollment_scope_id_unique" UNIQUE("tenant_id","school_id","school_enrollment_id","id"),
	CONSTRAINT "fee_payments_method_check" CHECK ("fee_payments"."method" in ('cash', 'bank_transfer', 'cheque', 'card_terminal', 'other')),
	CONSTRAINT "fee_payments_amount_check" CHECK ("fee_payments"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "fee_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_plan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"head_id" uuid NOT NULL,
	"label" text NOT NULL,
	"due_date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_plan_lines_scope_id_unique" UNIQUE("tenant_id","school_id","id"),
	CONSTRAINT "fee_plan_lines_plan_scope_id_unique" UNIQUE("tenant_id","school_id","plan_id","id"),
	CONSTRAINT "fee_plan_lines_amount_check" CHECK ("fee_plan_lines"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "fee_plan_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_plans_scope_id_unique" UNIQUE("tenant_id","school_id","id")
);
--> statement-breakpoint
ALTER TABLE "fee_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fee_receipt_counters" (
	"tenant_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"next_number" bigint DEFAULT 1 NOT NULL,
	CONSTRAINT "fee_receipt_counters_scope_unique" UNIQUE("tenant_id","school_id"),
	CONSTRAINT "fee_receipt_counters_positive_check" CHECK ("fee_receipt_counters"."next_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "fee_receipt_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fee_assignments" ADD CONSTRAINT "fee_assignments_plan_fk" FOREIGN KEY ("tenant_id","school_id","plan_id") REFERENCES "public"."fee_plans"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_assignments" ADD CONSTRAINT "fee_assignments_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_assignment_fk" FOREIGN KEY ("tenant_id","school_id","plan_id","school_enrollment_id","assignment_id") REFERENCES "public"."fee_assignments"("tenant_id","school_id","plan_id","school_enrollment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_line_fk" FOREIGN KEY ("tenant_id","school_id","plan_id","plan_line_id") REFERENCES "public"."fee_plan_lines"("tenant_id","school_id","plan_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_charges" ADD CONSTRAINT "fee_charges_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_charge_fk" FOREIGN KEY ("tenant_id","school_id","school_enrollment_id","charge_id") REFERENCES "public"."fee_charges"("tenant_id","school_id","school_enrollment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_payment_fk" FOREIGN KEY ("tenant_id","school_id","school_enrollment_id","payment_id") REFERENCES "public"."fee_payments"("tenant_id","school_id","school_enrollment_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_actor_membership_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_ledger_entries" ADD CONSTRAINT "fee_ledger_entries_actor_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_enrollment_fk" FOREIGN KEY ("tenant_id","school_id","school_enrollment_id") REFERENCES "public"."student_school_enrollments"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_actor_membership_fk" FOREIGN KEY ("tenant_id","actor_membership_id") REFERENCES "public"."memberships"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_payments" ADD CONSTRAINT "fee_payments_actor_fk" FOREIGN KEY ("actor_account_id","actor_membership_id") REFERENCES "public"."memberships"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plan_lines" ADD CONSTRAINT "fee_plan_lines_plan_fk" FOREIGN KEY ("tenant_id","school_id","plan_id") REFERENCES "public"."fee_plans"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plan_lines" ADD CONSTRAINT "fee_plan_lines_head_fk" FOREIGN KEY ("tenant_id","school_id","head_id") REFERENCES "public"."fee_heads"("tenant_id","school_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_plans" ADD CONSTRAINT "fee_plans_class_fk" FOREIGN KEY ("tenant_id","school_id","session_id","class_id") REFERENCES "public"."academic_classes"("tenant_id","school_id","session_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_receipt_counters" ADD CONSTRAINT "fee_receipt_counters_school_fk" FOREIGN KEY ("tenant_id","school_id") REFERENCES "public"."schools"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fee_assignments_plan_enrollment_unique" ON "fee_assignments" USING btree ("tenant_id","school_id","plan_id","school_enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_charges_assignment_line_unique" ON "fee_charges" USING btree ("tenant_id","school_id","assignment_id","plan_line_id");--> statement-breakpoint
CREATE INDEX "fee_charges_enrollment_idx" ON "fee_charges" USING btree ("tenant_id","school_id","school_enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_heads_code_unique" ON "fee_heads" USING btree ("tenant_id","school_id",upper(trim("code")));--> statement-breakpoint
CREATE UNIQUE INDEX "fee_ledger_entries_charge_unique" ON "fee_ledger_entries" USING btree ("tenant_id","school_id","charge_id") WHERE "fee_ledger_entries"."kind" = 'charge';--> statement-breakpoint
CREATE UNIQUE INDEX "fee_ledger_entries_reversal_unique" ON "fee_ledger_entries" USING btree ("tenant_id","school_id","payment_id","charge_id") WHERE "fee_ledger_entries"."kind" = 'payment_reversal';--> statement-breakpoint
CREATE INDEX "fee_ledger_entries_enrollment_created_idx" ON "fee_ledger_entries" USING btree ("tenant_id","school_id","school_enrollment_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_receipt_unique" ON "fee_payments" USING btree ("tenant_id","school_id","receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_payments_idempotency_unique" ON "fee_payments" USING btree ("tenant_id","school_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "fee_plans_name_unique" ON "fee_plans" USING btree ("tenant_id","school_id","session_id","class_id",upper(trim("name")));--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_assignments" AS PERMISSIVE FOR ALL TO public USING ("fee_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_assignments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_charges" AS PERMISSIVE FOR ALL TO public USING ("fee_charges"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_charges"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_heads" AS PERMISSIVE FOR ALL TO public USING ("fee_heads"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_heads"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_ledger_entries" AS PERMISSIVE FOR ALL TO public USING ("fee_ledger_entries"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_ledger_entries"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_payments" AS PERMISSIVE FOR ALL TO public USING ("fee_payments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_payments"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_plan_lines" AS PERMISSIVE FOR ALL TO public USING ("fee_plan_lines"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_plan_lines"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_plans" AS PERMISSIVE FOR ALL TO public USING ("fee_plans"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_plans"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "fee_receipt_counters" AS PERMISSIVE FOR ALL TO public USING ("fee_receipt_counters"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid) WITH CHECK ("fee_receipt_counters"."tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE fee_heads FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_plans FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_plan_lines FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_assignments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_charges FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_payments FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_ledger_entries FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE fee_receipt_counters FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE fee_heads, fee_plans, fee_plan_lines, fee_assignments, fee_charges, fee_payments, fee_ledger_entries TO classloom_runtime;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE fee_receipt_counters TO classloom_runtime;--> statement-breakpoint
INSERT INTO permissions (key, family, scope_kind, action, read_only) VALUES ('finance.manage', 'finance', 'school', 'manage', false) ON CONFLICT (key) DO NOTHING;--> statement-breakpoint
INSERT INTO authorization_role_permissions (tenant_id, role_id, permission_key)
SELECT tenant_id, id, 'finance.manage' FROM authorization_roles
WHERE system_key IN ('tenant_admin', 'school_admin', 'finance_operator')
ON CONFLICT DO NOTHING;
