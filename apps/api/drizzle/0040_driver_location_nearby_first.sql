ALTER TABLE "driver_presence" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "driver_presence" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "driver_presence" ADD COLUMN "located_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "widened_at" timestamp with time zone;