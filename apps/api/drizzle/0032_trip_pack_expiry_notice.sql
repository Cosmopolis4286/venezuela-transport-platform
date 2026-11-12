ALTER TYPE "public"."notification_kind" ADD VALUE 'trip_pack_expiring';--> statement-breakpoint
ALTER TABLE "trip_packs" ADD COLUMN "expiry_notice_sent_at" timestamp with time zone;