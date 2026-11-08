CREATE TYPE "public"."trip_pack_status" AS ENUM('pending_payment', 'active', 'exhausted', 'expired', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'trip_pack_activated';--> statement-breakpoint
CREATE TABLE "trip_pack_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_area_id" uuid NOT NULL,
	"stop_a_id" uuid NOT NULL,
	"stop_b_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"trips" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"validity_days" integer DEFAULT 60 NOT NULL,
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
	"service_area_id" uuid NOT NULL,
	"stop_a_id" uuid NOT NULL,
	"stop_b_id" uuid NOT NULL,
	"mode" "transport_mode" NOT NULL,
	"trips" integer NOT NULL,
	"remaining" integer NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"validity_days" integer NOT NULL,
	"status" "trip_pack_status" DEFAULT 'pending_payment' NOT NULL,
	"payment_due_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
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
ALTER TABLE "payments" ALTER COLUMN "booking_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "trip_pack_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_stop_a_id_stops_id_fk" FOREIGN KEY ("stop_a_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_stop_b_id_stops_id_fk" FOREIGN KEY ("stop_b_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_pack_products" ADD CONSTRAINT "trip_pack_products_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_product_id_trip_pack_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."trip_pack_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_stop_a_id_stops_id_fk" FOREIGN KEY ("stop_a_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_packs" ADD CONSTRAINT "trip_packs_stop_b_id_stops_id_fk" FOREIGN KEY ("stop_b_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_exchange_rates" ADD CONSTRAINT "platform_exchange_rates_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_pack_products_area_idx" ON "trip_pack_products" USING btree ("service_area_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_packs_code_key" ON "trip_packs" USING btree ("code");--> statement-breakpoint
CREATE INDEX "trip_packs_user_idx" ON "trip_packs" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_pack_id_trip_packs_id_fk" FOREIGN KEY ("trip_pack_id") REFERENCES "public"."trip_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_trip_pack_pending_key" ON "payments" USING btree ("trip_pack_id") WHERE "payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payments_trip_pack_idx" ON "payments" USING btree ("trip_pack_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subject_check" CHECK (("payments"."booking_id" is null) <> ("payments"."trip_pack_id" is null));