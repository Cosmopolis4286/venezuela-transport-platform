ALTER TABLE "users" DROP CONSTRAINT "users_contact_present";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_contact_present" CHECK ("users"."email" is not null or "users"."phone" is not null or "users"."deleted_at" is not null or "users"."guest");