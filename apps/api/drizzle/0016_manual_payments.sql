ALTER TYPE "public"."payment_status" ADD VALUE 'reported' BEFORE 'confirmed';--> statement-breakpoint
ALTER TYPE "public"."payment_status" ADD VALUE 'rejected' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'payment_rejected';--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"method" "payment_method" NOT NULL,
	"fields" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_accounts_owner_method_key" UNIQUE NULLS NOT DISTINCT("organization_id","method")
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "payer_reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reported_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;