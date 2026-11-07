ALTER TYPE "public"."notification_kind" ADD VALUE 'departure_cancelled';--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "cancelled_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;