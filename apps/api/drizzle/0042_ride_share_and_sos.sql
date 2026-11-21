ALTER TYPE "public"."notification_kind" ADD VALUE 'safety_alert';--> statement-breakpoint
CREATE TABLE "safety_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reporter_role" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolved_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "share_token" text;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_ride_id_taxi_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_incidents" ADD CONSTRAINT "safety_incidents_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_incidents_open_key" ON "safety_incidents" USING btree ("ride_id","reporter_user_id") WHERE "safety_incidents"."resolved_at" is null;--> statement-breakpoint
CREATE INDEX "safety_incidents_created_idx" ON "safety_incidents" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_share_token_key" ON "taxi_rides" USING btree ("share_token") WHERE "taxi_rides"."share_token" is not null;