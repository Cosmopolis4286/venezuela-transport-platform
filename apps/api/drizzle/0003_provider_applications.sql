CREATE TYPE "public"."application_role" AS ENUM('driver', 'dispatcher', 'ticket_agent', 'inspector');--> statement-breakpoint
CREATE TYPE "public"."application_status" AS ENUM('draft', 'submitted', 'changes_requested', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."document_content_type" AS ENUM('image/jpeg', 'image/png', 'application/pdf');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('identity_document', 'driver_license', 'medical_certificate', 'vehicle_registration', 'liability_insurance');--> statement-breakpoint
CREATE TYPE "public"."document_review_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."identity_document_type" AS ENUM('V', 'E', 'P');--> statement-breakpoint
CREATE TYPE "public"."organization_decision" AS ENUM('pending', 'accepted', 'declined');--> statement-breakpoint
CREATE TABLE "provider_application_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" "document_content_type" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"expires_on" date,
	"status" "document_review_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'draft' NOT NULL,
	"desired_role" "application_role" NOT NULL,
	"organization_id" uuid,
	"organization_decision" "organization_decision",
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"document_type" "identity_document_type" NOT NULL,
	"document_number" text NOT NULL,
	"birth_date" date NOT NULL,
	"state" text,
	"city" text,
	"provides_vehicle" boolean DEFAULT false NOT NULL,
	"vehicle" jsonb,
	"review_notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "provider_application_documents" ADD CONSTRAINT "provider_application_documents_application_id_provider_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."provider_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_applications" ADD CONSTRAINT "provider_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_applications" ADD CONSTRAINT "provider_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_applications" ADD CONSTRAINT "provider_applications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_application_documents_kind_key" ON "provider_application_documents" USING btree ("application_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_applications_open_key" ON "provider_applications" USING btree ("user_id") WHERE "provider_applications"."status" in ('draft', 'submitted', 'changes_requested');--> statement-breakpoint
CREATE INDEX "provider_applications_status_idx" ON "provider_applications" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "provider_applications_organization_idx" ON "provider_applications" USING btree ("organization_id","organization_decision");