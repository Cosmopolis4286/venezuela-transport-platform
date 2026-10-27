CREATE TYPE "public"."payment_currency" AS ENUM('VES', 'BRL', 'USDT');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pago_movil', 'bank_transfer', 'pix', 'usdt');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'confirmed', 'cancelled', 'refund_due');--> statement-breakpoint
CREATE TYPE "public"."rate_currency" AS ENUM('VES', 'BRL');--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"organization_id" uuid NOT NULL,
	"currency" "rate_currency" NOT NULL,
	"units_per_usd" numeric(18, 4) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rates_organization_id_currency_pk" PRIMARY KEY("organization_id","currency")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" "payment_currency" NOT NULL,
	"rate" numeric(18, 6),
	"reference" text NOT NULL,
	"provider" text NOT NULL,
	"instructions" jsonb NOT NULL,
	"provider_reference" text,
	"received_amount" numeric(14, 2),
	"expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_passengers" ADD COLUMN "boarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_passengers" ADD COLUMN "boarded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_key" ON "payments" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_booking_pending_key" ON "payments" USING btree ("booking_id") WHERE "payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_boarded_by_user_id_users_id_fk" FOREIGN KEY ("boarded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;