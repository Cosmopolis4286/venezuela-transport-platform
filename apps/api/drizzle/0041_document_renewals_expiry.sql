ALTER TYPE "public"."notification_kind" ADD VALUE 'document_expiring';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'document_renewal_reviewed';--> statement-breakpoint
CREATE TABLE "document_expiry_notices" (
	"subject" text NOT NULL,
	"expires_on" date NOT NULL,
	"stage" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_expiry_notices_subject_expires_on_stage_pk" PRIMARY KEY("subject","expires_on","stage")
);
--> statement-breakpoint
CREATE TABLE "document_renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_key" text,
	"file_name" text NOT NULL,
	"content_type" "document_content_type" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"expires_on" date NOT NULL,
	"status" "document_review_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_renewals" ADD CONSTRAINT "document_renewals_application_id_provider_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."provider_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_renewals" ADD CONSTRAINT "document_renewals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_renewals_pending_key" ON "document_renewals" USING btree ("application_id","kind") WHERE "document_renewals"."status" = 'pending';