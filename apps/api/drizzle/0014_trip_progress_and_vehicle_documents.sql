CREATE TYPE "public"."vehicle_document_kind" AS ENUM('registration', 'insurance', 'transport_permit');--> statement-breakpoint
CREATE TABLE "vehicle_documents" (
	"vehicle_id" uuid NOT NULL,
	"kind" "vehicle_document_kind" NOT NULL,
	"number" text NOT NULL,
	"expires_on" date NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_documents_vehicle_id_kind_pk" PRIMARY KEY("vehicle_id","kind")
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "departed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "arrived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_documents" ADD CONSTRAINT "vehicle_documents_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;