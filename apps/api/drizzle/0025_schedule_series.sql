ALTER TABLE "route_schedules" ADD COLUMN "series_id" uuid;--> statement-breakpoint
CREATE INDEX "route_schedules_series_idx" ON "route_schedules" USING btree ("series_id");