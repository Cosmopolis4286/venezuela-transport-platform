CREATE TYPE "public"."payout_method" AS ENUM('bank_transfer', 'pago_movil', 'usdt');--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'refunded';--> statement-breakpoint
CREATE TABLE "organization_commissions" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"rate" numeric(5, 2) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payout_method" NOT NULL,
	"reference" text NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"seats" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"gross" numeric(12, 2) NOT NULL,
	"commission_rate" numeric(5, 2) NOT NULL,
	"commission" numeric(12, 2) NOT NULL,
	"earned" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_commissions" ADD CONSTRAINT "organization_commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_commissions" ADD CONSTRAINT "organization_commissions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD CONSTRAINT "settlement_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD CONSTRAINT "settlement_entries_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payouts_organization_idx" ON "payouts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entries_booking_key" ON "settlement_entries" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "settlement_entries_organization_idx" ON "settlement_entries" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_by_user_id_users_id_fk" FOREIGN KEY ("refunded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;