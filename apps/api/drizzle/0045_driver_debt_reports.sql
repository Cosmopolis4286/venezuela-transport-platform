ALTER TYPE "public"."notification_kind" ADD VALUE 'debt_payment';--> statement-breakpoint
CREATE TABLE "driver_debt_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text NOT NULL,
	"status" text DEFAULT 'reported' NOT NULL,
	"rejection_reason" text,
	"payout_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_debt_reports" ADD CONSTRAINT "driver_debt_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_debt_reports" ADD CONSTRAINT "driver_debt_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_debt_reports" ADD CONSTRAINT "driver_debt_reports_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_debt_reports" ADD CONSTRAINT "driver_debt_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "driver_debt_reports_waiting_key" ON "driver_debt_reports" USING btree ("user_id","organization_id","currency") WHERE "driver_debt_reports"."status" = 'reported';