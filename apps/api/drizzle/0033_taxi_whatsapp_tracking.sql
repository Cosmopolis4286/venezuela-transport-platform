CREATE TYPE "public"."taxi_channel" AS ENUM('app', 'whatsapp');--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "channel" "taxi_channel" DEFAULT 'app' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "tracking_token" text;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "rating" smallint;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "rating_comment" text;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "rated_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_tracking_token_key" ON "taxi_rides" USING btree ("tracking_token") WHERE "taxi_rides"."tracking_token" is not null;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_rating_check" CHECK ("taxi_rides"."rating" is null or "taxi_rides"."rating" between 1 and 5);