CREATE TYPE "public"."bcv_rate_source" AS ENUM('bcv', 'dolarapi', 'manual');--> statement-breakpoint
ALTER TABLE "bcv_rates" ADD COLUMN "source" "bcv_rate_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
-- Bolívares always use the BCV's official rate now (ADR-048): rates typed by hand are dropped.
DELETE FROM "exchange_rates" WHERE "currency" = 'VES';--> statement-breakpoint
DELETE FROM "platform_exchange_rates" WHERE "currency" = 'VES';
