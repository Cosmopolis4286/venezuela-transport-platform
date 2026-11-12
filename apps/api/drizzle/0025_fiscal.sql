CREATE TYPE "public"."buyer_id_type" AS ENUM('V', 'E', 'J', 'G', 'P');--> statement-breakpoint
CREATE TYPE "public"."invoice_kind" AS ENUM('invoice', 'credit_note');--> statement-breakpoint
CREATE TYPE "public"."invoice_reason" AS ENUM('service_fee', 'fee_refund', 'operator_cancellation');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'issued', 'voided');--> statement-breakpoint
CREATE TYPE "public"."taxpayer_type" AS ENUM('ordinary', 'formal');--> statement-breakpoint
CREATE TABLE "bcv_rates" (
	"date" date PRIMARY KEY NOT NULL,
	"units_per_usd" numeric(18, 6) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fiscal_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"legal_name" text NOT NULL,
	"rif" text NOT NULL,
	"fiscal_address" text NOT NULL,
	"taxpayer_type" "taxpayer_type" NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_settings_single_row" CHECK ("fiscal_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "invoice_kind" NOT NULL,
	"reason" "invoice_reason" NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"booking_id" uuid NOT NULL,
	"related_invoice_id" uuid,
	"buyer_organization_id" uuid,
	"buyer_name" text NOT NULL,
	"buyer_id_type" "buyer_id_type" NOT NULL,
	"buyer_id_number" text NOT NULL,
	"buyer_address" text,
	"description" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"number" text,
	"control_number" text,
	"issued_on" date,
	"issuer_reference" text,
	"taxpayer_type" "taxpayer_type",
	"exchange_rate" numeric(18, 6),
	"vat_rate" numeric(5, 2),
	"base_ves" numeric(16, 2),
	"not_taxed_ves" numeric(16, 2),
	"vat_ves" numeric(16, 2),
	"total_ves" numeric(16, 2),
	"issued_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"voided_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"supplier_rif" text NOT NULL,
	"supplier_name" text NOT NULL,
	"invoice_number" text NOT NULL,
	"control_number" text NOT NULL,
	"base" numeric(16, 2) NOT NULL,
	"exempt" numeric(16, 2) NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"vat" numeric(16, 2) NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bcv_rates" ADD CONSTRAINT "bcv_rates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_related_invoice_id_invoices_id_fk" FOREIGN KEY ("related_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_organization_id_organizations_id_fk" FOREIGN KEY ("buyer_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_booking_reason_key" ON "invoices" USING btree ("booking_id","reason");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_kind_number_key" ON "invoices" USING btree ("kind","number") WHERE "invoices"."number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_control_number_key" ON "invoices" USING btree ("control_number") WHERE "invoices"."control_number" is not null;--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "invoices_issued_on_idx" ON "invoices" USING btree ("issued_on");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_supplier_invoice_key" ON "purchases" USING btree ("supplier_rif","invoice_number");--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("date");