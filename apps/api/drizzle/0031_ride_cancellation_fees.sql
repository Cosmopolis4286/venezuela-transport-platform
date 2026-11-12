ALTER TYPE "public"."settlement_entry_kind" ADD VALUE 'ride_cancellation_fee';--> statement-breakpoint
CREATE TABLE "ride_cancellation_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cancelled_ride_id" uuid NOT NULL,
	"passenger_user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"charged_ride_id" uuid,
	"charged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_cancellation_fees_cancelledRideId_unique" UNIQUE("cancelled_ride_id"),
	CONSTRAINT "ride_cancellation_fees_amount_check" CHECK ("ride_cancellation_fees"."amount" > 0),
	CONSTRAINT "ride_cancellation_fees_charged_check" CHECK (("ride_cancellation_fees"."charged_at" is null) = ("ride_cancellation_fees"."charged_ride_id" is null))
);
--> statement-breakpoint
DROP INDEX "settlement_entries_taxi_ride_kind_key";--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ride_free_cancel_minutes" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ride_cancel_fee_percent" smallint DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_cancelled_ride_id_taxi_rides_id_fk" FOREIGN KEY ("cancelled_ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_passenger_user_id_users_id_fk" FOREIGN KEY ("passenger_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_charged_ride_id_taxi_rides_id_fk" FOREIGN KEY ("charged_ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ride_cancellation_fees_pending_idx" ON "ride_cancellation_fees" USING btree ("passenger_user_id") WHERE "ride_cancellation_fees"."charged_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entries_taxi_ride_kind_org_key" ON "settlement_entries" USING btree ("taxi_ride_id","kind","organization_id");