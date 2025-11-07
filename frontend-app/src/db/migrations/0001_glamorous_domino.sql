ALTER TABLE "scrape_requests" ADD COLUMN "heartbeat_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "ix_scrape_requests_created_at" ON "scrape_requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_scrape_requests_status_created" ON "scrape_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ix_scrape_requests_started_at" ON "scrape_requests" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "ix_scrape_requests_heartbeat_at" ON "scrape_requests" USING btree ("heartbeat_at");