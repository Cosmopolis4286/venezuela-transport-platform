CREATE TYPE "public"."taxi_direction" AS ENUM('from_terminal', 'to_terminal');--> statement-breakpoint
CREATE TYPE "public"."taxi_ride_status" AS ENUM('requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "taxi_rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"passenger_user_id" uuid NOT NULL,
	"terminal_stop_id" uuid NOT NULL,
	"direction" "taxi_direction" NOT NULL,
	"address" text NOT NULL,
	"notes" text,
	"passengers" smallint NOT NULL,
	"contact_phone" text,
	"status" "taxi_ride_status" DEFAULT 'requested' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"organization_id" uuid,
	"driver_user_id" uuid,
	"vehicle_id" uuid,
	"fare_amount" numeric(12, 2),
	"fare_currency" "currency",
	"accepted_at" timestamp with time zone,
	"picked_up_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxi_rides_passengers_check" CHECK ("taxi_rides"."passengers" between 1 and 6),
	CONSTRAINT "taxi_rides_taken_check" CHECK ("taxi_rides"."status" in ('requested', 'expired', 'cancelled') or ("taxi_rides"."organization_id" is not null and "taxi_rides"."driver_user_id" is not null and "taxi_rides"."vehicle_id" is not null and "taxi_rides"."fare_amount" is not null and "taxi_rides"."fare_currency" is not null))
);
--> statement-breakpoint
CREATE TABLE "taxi_service_areas" (
	"organization_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "taxi_service_areas_organization_id_stop_id_pk" PRIMARY KEY("organization_id","stop_id")
);
--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_passenger_user_id_users_id_fk" FOREIGN KEY ("passenger_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_terminal_stop_id_stops_id_fk" FOREIGN KEY ("terminal_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_service_areas" ADD CONSTRAINT "taxi_service_areas_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_service_areas" ADD CONSTRAINT "taxi_service_areas_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_passenger_open_key" ON "taxi_rides" USING btree ("passenger_user_id") WHERE "taxi_rides"."status" in ('requested', 'accepted', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_driver_active_key" ON "taxi_rides" USING btree ("driver_user_id") WHERE "taxi_rides"."status" in ('accepted', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_vehicle_active_key" ON "taxi_rides" USING btree ("vehicle_id") WHERE "taxi_rides"."status" in ('accepted', 'in_progress');--> statement-breakpoint
CREATE INDEX "taxi_rides_terminal_status_idx" ON "taxi_rides" USING btree ("terminal_stop_id","status","created_at");--> statement-breakpoint
CREATE INDEX "taxi_rides_organization_idx" ON "taxi_rides" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "taxi_rides_passenger_idx" ON "taxi_rides" USING btree ("passenger_user_id","created_at");--> statement-breakpoint
CREATE INDEX "taxi_service_areas_stop_idx" ON "taxi_service_areas" USING btree ("stop_id");