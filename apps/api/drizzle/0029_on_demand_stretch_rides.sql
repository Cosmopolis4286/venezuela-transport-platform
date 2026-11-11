CREATE TYPE "public"."taxi_ride_kind" AS ENUM('terminal', 'stretch');--> statement-breakpoint
CREATE TABLE "on_demand_fares" (
	"organization_id" uuid NOT NULL,
	"service_area_id" uuid NOT NULL,
	"stop_a_id" uuid NOT NULL,
	"stop_b_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "on_demand_fares_organization_id_stop_a_id_stop_b_id_mode_pk" PRIMARY KEY("organization_id","stop_a_id","stop_b_id","mode"),
	CONSTRAINT "on_demand_fares_order_check" CHECK ("on_demand_fares"."stop_a_id" < "on_demand_fares"."stop_b_id"),
	CONSTRAINT "on_demand_fares_amount_check" CHECK ("on_demand_fares"."amount" > 0)
);
--> statement-breakpoint
DROP INDEX "taxi_rides_driver_active_key";--> statement-breakpoint
DROP INDEX "taxi_rides_vehicle_active_key";--> statement-breakpoint
ALTER TABLE "taxi_rides" ALTER COLUMN "terminal_stop_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ALTER COLUMN "direction" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "kind" "taxi_ride_kind" DEFAULT 'terminal' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "from_stop_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "to_stop_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "service_area_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "mode" "transport_mode" DEFAULT 'car' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_stop_a_id_stops_id_fk" FOREIGN KEY ("stop_a_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_stop_b_id_stops_id_fk" FOREIGN KEY ("stop_b_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "on_demand_fares_stretch_idx" ON "on_demand_fares" USING btree ("stop_a_id","stop_b_id","mode");--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_from_stop_id_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_to_stop_id_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taxi_rides_stretch_status_idx" ON "taxi_rides" USING btree ("from_stop_id","to_stop_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_driver_active_key" ON "taxi_rides" USING btree ("driver_user_id") WHERE "taxi_rides"."status" = 'in_progress' or ("taxi_rides"."status" = 'accepted' and "taxi_rides"."scheduled_for" is null);--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_vehicle_active_key" ON "taxi_rides" USING btree ("vehicle_id") WHERE "taxi_rides"."status" = 'in_progress' or ("taxi_rides"."status" = 'accepted' and "taxi_rides"."scheduled_for" is null);--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_kind_check" CHECK (("taxi_rides"."kind" = 'terminal' and "taxi_rides"."terminal_stop_id" is not null and "taxi_rides"."direction" is not null) or ("taxi_rides"."kind" = 'stretch' and "taxi_rides"."from_stop_id" is not null and "taxi_rides"."to_stop_id" is not null and "taxi_rides"."service_area_id" is not null));