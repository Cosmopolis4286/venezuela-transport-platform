CREATE TYPE "public"."payout_status" AS ENUM('pending', 'sent');--> statement-breakpoint
ALTER TYPE "public"."settlement_entry_kind" ADD VALUE 'ride_commission';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'commission_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'payout_sent';--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "status" "payout_status" DEFAULT 'sent' NOT NULL;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "run_week" text;--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "independent_commission_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "independent_commission_next_rate" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "independent_commission_next_from" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_run_week_key" ON "payouts" USING btree ("run_week","organization_id","driver_user_id","currency") WHERE "payouts"."run_week" is not null;