CREATE TYPE "public"."trip_pack_status" AS ENUM('pending_payment', 'active', 'exhausted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."taxi_ride_kind" AS ENUM('terminal', 'stretch');--> statement-breakpoint
ALTER TYPE "public"."settlement_entry_kind" ADD VALUE 'ride_cancellation_fee';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'trip_pack_activated';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'trip_pack_expiring';--> statement-breakpoint
CREATE TABLE "trip_pack_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"zone_id" uuid NOT NULL,
	"stop_a_id" uuid NOT NULL,
	"stop_b_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"trips" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"validity_days" integer DEFAULT 60 NOT NULL,
	"max_fare" numeric(12, 2),
	"active" boolean DEFAULT true NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_pack_products_stops_check" CHECK ("trip_pack_products"."stop_a_id" <> "trip_pack_products"."stop_b_id"),
	CONSTRAINT "trip_pack_products_trips_check" CHECK ("trip_pack_products"."trips" between 2 and 100),
	CONSTRAINT "trip_pack_products_price_check" CHECK ("trip_pack_products"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"stop_a_id" uuid NOT NULL,
	"stop_b_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"trips" integer NOT NULL,
	"remaining" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"validity_days" integer NOT NULL,
	"max_fare" numeric(12, 2),
	"status" "trip_pack_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_due_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"expiry_notice_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_packs_remaining_check" CHECK ("trip_packs"."remaining" between 0 and "trip_packs"."trips")
);
--> statement-breakpoint
CREATE TABLE "platform_exchange_rates" (
	"currency" "rate_currency" PRIMARY KEY NOT NULL,
	"units_per_usd" numeric(18, 4) NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "on_demand_fares" (
	"organization_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	"stop_a_id" uuid NOT NULL,
	"stop_b_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "on_demand_fares_organization_id_stop_a_id_stop_b_id_mode_pk" PRIMARY KEY("organization_id","stop_a_id","stop_b_id","mode"),
	CONSTRAINT "on_demand_fares_order_check" CHECK ("on_demand_fares"."stop_a_id" < "on_demand_fares"."stop_b_id"),
	CONSTRAINT "on_demand_fares_amount_check" CHECK ("on_demand_fares"."amount" > 0)
);
--> statement-breakpoint
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
DROP INDEX "taxi_rides_driver_active_key";--> statement-breakpoint
DROP INDEX "taxi_rides_vehicle_active_key";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ALTER COLUMN "terminal_stop_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ALTER COLUMN "direction" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_entries" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "trip_pack_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "trip_pack_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "kind" "taxi_ride_kind" DEFAULT 'terminal' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "from_stop_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "to_stop_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "mode" "transport_mode" DEFAULT 'car' NOT NULL;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "scheduled_for" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "trip_pack_id" uuid;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "pickup_code" text;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD COLUMN "pickup_code_attempts" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_policies" ADD COLUMN "accepts_trip_packs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ride_free_cancel_minutes" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD COLUMN "ride_cancel_fee_percent" smallint DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD COLUMN "taxi_ride_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_zone_id_operating_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."operating_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_stop_a_id_stops_id_fk" FOREIGN KEY ("stop_a_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_stop_b_id_stops_id_fk" FOREIGN KEY ("stop_b_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_product_id_trip_pack_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."trip_pack_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_zone_id_operating_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."operating_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_stop_a_id_stops_id_fk" FOREIGN KEY ("stop_a_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_stop_b_id_stops_id_fk" FOREIGN KEY ("stop_b_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_exchange_rates" ADD CONSTRAINT "platform_exchange_rates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_zone_id_operating_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."operating_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_stop_a_id_stops_id_fk" FOREIGN KEY ("stop_a_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "on_demand_fares" ADD CONSTRAINT "on_demand_fares_stop_b_id_stops_id_fk" FOREIGN KEY ("stop_b_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_cancelled_ride_id_taxi_rides_id_fk" FOREIGN KEY ("cancelled_ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_passenger_user_id_users_id_fk" FOREIGN KEY ("passenger_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_cancellation_fees" ADD CONSTRAINT "ride_cancellation_fees_charged_ride_id_taxi_rides_id_fk" FOREIGN KEY ("charged_ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_pack_products_zone_idx" ON "trip_pack_products" USING btree ("zone_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_packs_code_key" ON "trip_packs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "trip_packs_user_idx" ON "trip_packs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "on_demand_fares_stretch_idx" ON "on_demand_fares" USING btree ("stop_a_id","stop_b_id","mode");--> statement-breakpoint
CREATE INDEX "ride_cancellation_fees_pending_idx" ON "ride_cancellation_fees" USING btree ("passenger_user_id") WHERE "ride_cancellation_fees"."charged_at" is null;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_trip_pack_id_trip_packs_id_fk" FOREIGN KEY ("trip_pack_id") REFERENCES "public"."trip_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_pack_id_trip_packs_id_fk" FOREIGN KEY ("trip_pack_id") REFERENCES "public"."trip_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_from_stop_id_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_to_stop_id_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_zone_id_operating_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."operating_zones"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_trip_pack_id_trip_packs_id_fk" FOREIGN KEY ("trip_pack_id") REFERENCES "public"."trip_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD CONSTRAINT "settlement_entries_taxi_ride_id_taxi_rides_id_fk" FOREIGN KEY ("taxi_ride_id") REFERENCES "public"."taxi_rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_trip_pack_idx" ON "bookings" USING btree ("trip_pack_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_trip_pack_pending_key" ON "payments" USING btree ("trip_pack_id") WHERE "payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payments_trip_pack_idx" ON "payments" USING btree ("trip_pack_id");--> statement-breakpoint
CREATE INDEX "taxi_rides_stretch_status_idx" ON "taxi_rides" USING btree ("from_stop_id","to_stop_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_entries_taxi_ride_kind_org_key" ON "settlement_entries" USING btree ("taxi_ride_id","kind","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_driver_active_key" ON "taxi_rides" USING btree ("driver_user_id") WHERE "taxi_rides"."status" = 'in_progress' or ("taxi_rides"."status" = 'accepted' and "taxi_rides"."scheduled_for" is null);--> statement-breakpoint
CREATE UNIQUE INDEX "taxi_rides_vehicle_active_key" ON "taxi_rides" USING btree ("vehicle_id") WHERE "taxi_rides"."status" = 'in_progress' or ("taxi_rides"."status" = 'accepted' and "taxi_rides"."scheduled_for" is null);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subject_check" CHECK (("payments"."booking_id" is null) <> ("payments"."trip_pack_id" is null));--> statement-breakpoint
ALTER TABLE "taxi_rides" ADD CONSTRAINT "taxi_rides_kind_check" CHECK (("taxi_rides"."kind" = 'terminal' and "taxi_rides"."terminal_stop_id" is not null and "taxi_rides"."direction" is not null) or ("taxi_rides"."kind" = 'stretch' and "taxi_rides"."from_stop_id" is not null and "taxi_rides"."to_stop_id" is not null and "taxi_rides"."zone_id" is not null));--> statement-breakpoint
ALTER TABLE "settlement_entries" ADD CONSTRAINT "settlement_entries_subject_check" CHECK (("settlement_entries"."booking_id" is null) <> ("settlement_entries"."taxi_ride_id" is null));