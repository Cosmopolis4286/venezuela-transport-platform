CREATE TYPE "public"."payment_collection" AS ENUM('platform', 'operator');--> statement-breakpoint
CREATE TYPE "public"."payout_direction" AS ENUM('to_operator', 'from_operator');--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "collector_organization_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD COLUMN "payment_collection" "payment_collection";--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "direction" "payout_direction" DEFAULT 'to_operator' NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD COLUMN "collected_by" "payment_collection" DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collector_organization_id_organizations_id_fk" FOREIGN KEY ("collector_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;