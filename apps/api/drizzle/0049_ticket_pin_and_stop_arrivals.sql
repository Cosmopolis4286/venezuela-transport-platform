ALTER TYPE "public"."notification_kind" ADD VALUE 'driver_at_stop';--> statement-breakpoint
CREATE TABLE "trip_stop_arrivals" (
	"trip_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"driver_user_id" uuid,
	"arrived_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_stop_arrivals_trip_id_stop_id_pk" PRIMARY KEY("trip_id","stop_id")
);
--> statement-breakpoint
ALTER TABLE "booking_passengers" ADD COLUMN "pin" text;--> statement-breakpoint
ALTER TABLE "trip_stop_arrivals" ADD CONSTRAINT "trip_stop_arrivals_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stop_arrivals" ADD CONSTRAINT "trip_stop_arrivals_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stop_arrivals" ADD CONSTRAINT "trip_stop_arrivals_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_passengers_active_pin_key" ON "booking_passengers" USING btree ("trip_id","pin") WHERE "booking_passengers"."active";