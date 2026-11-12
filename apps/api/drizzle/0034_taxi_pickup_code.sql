ALTER TABLE "taxi_rides" ADD COLUMN "pickup_code" text;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "pickup_code_attempts" smallint DEFAULT 0 NOT NULL;