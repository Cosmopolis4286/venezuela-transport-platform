CREATE TYPE "public"."zone_status" AS ENUM('active', 'coming_soon', 'paused');--> statement-breakpoint
CREATE TABLE "operating_zones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "zone_status" DEFAULT 'coming_soon' NOT NULL,
	"default_currency" "currency" DEFAULT 'USD' NOT NULL,
	"commission_rate" numeric(5, 2),
	"center" geometry(point,4326),
	"radius_km" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operating_zones_commission_range" CHECK ("operating_zones"."commission_rate" is null or ("operating_zones"."commission_rate" >= 0 and "operating_zones"."commission_rate" <= 100)),
	CONSTRAINT "operating_zones_area" CHECK (("operating_zones"."center" is null) = ("operating_zones"."radius_km" is null) and ("operating_zones"."radius_km" is null or "operating_zones"."radius_km" between 1 and 500))
);
--> statement-breakpoint
ALTER TABLE "stops" ADD COLUMN "zone_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "operating_zones_name_key" ON "operating_zones" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "operating_zones_slug_key" ON "operating_zones" USING btree ("slug");--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_zone_id_operating_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."operating_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stops_zone_idx" ON "stops" USING btree ("zone_id");