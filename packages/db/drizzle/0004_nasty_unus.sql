CREATE INDEX "auth_rate_limits_window_idx" ON "auth_rate_limits" USING btree ("blocked_until","window_started_at");--> statement-breakpoint
CREATE INDEX "invitations_expiry_idx" ON "invitations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("idle_expires_at","absolute_expires_at");