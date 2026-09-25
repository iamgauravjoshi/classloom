CREATE POLICY "invitations_token_lookup" ON "invitations" AS PERMISSIVE FOR SELECT TO public USING (token_hash = current_setting('app.invitation_token_hash', true));--> statement-breakpoint
ALTER TABLE "invitations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "invitations" TO classloom_runtime;
