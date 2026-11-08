CREATE TYPE "public"."payee" AS ENUM('organization', 'driver');--> statement-breakpoint
CREATE TYPE "public"."route_scope" AS ENUM('interurban', 'suburban');--> statement-breakpoint
CREATE TABLE "driver_payout_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"method" "payout_method" NOT NULL,
	"bank" text NOT NULL,
	"account" text NOT NULL,
	"holder_id" text NOT NULL,
	"holder_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "scope" "route_scope" DEFAULT 'interurban' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "payee_override" "payee";--> statement-breakpoint
ALTER TABLE "payouts" ADD COLUMN "driver_user_id" uuid;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD COLUMN "payee" "payee" DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_payout_accounts" ADD CONSTRAINT "driver_payout_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_driver_user_id_users_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;