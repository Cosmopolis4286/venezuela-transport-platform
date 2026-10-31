CREATE TYPE "public"."settlement_entry_kind" AS ENUM('booking', 'cancellation');--> statement-breakpoint
CREATE TABLE "organization_policies" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"commission_rate" numeric(5, 2),
	"refund_tiers" jsonb,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"commission_rate" numeric(5, 2) NOT NULL,
	"refund_tiers" jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_single_row" CHECK ("platform_settings"."id" = 1)
);
--> statement-breakpoint
DROP INDEX "settlement_entries_booking_key";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD COLUMN "kind" "settlement_entry_kind" DEFAULT 'booking' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD CONSTRAINT "organization_policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD CONSTRAINT "organization_policies_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entries_booking_kind_key" ON "settlement_entries" USING btree ("booking_id","kind");--> statement-breakpoint
-- Platform defaults (ADR-025): 8 % commission; 100 % back up to 48 h before, 50 % up to 2 h.
INSERT INTO "platform_settings" ("id", "commission_rate", "refund_tiers") VALUES (1, 8.00, '[{"hoursBefore":48,"percent":100},{"hoursBefore":2,"percent":50}]'::jsonb);--> statement-breakpoint
-- Commissions agreed with operators move to their policies.
INSERT INTO "organization_policies" ("organization_id", "commission_rate", "updated_by_user_id", "created_at", "updated_at") SELECT "organization_id", "rate", "updated_by_user_id", "created_at", "updated_at" FROM "organization_commissions";
