CREATE TYPE "public"."route_service" AS ENUM('intercity', 'suburban');--> statement-breakpoint
CREATE TABLE "network_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"intercity_enabled" boolean DEFAULT true NOT NULL,
	"intercity_closed_cities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_settings_single_row" CHECK ("network_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "service_area_stops" (
	"service_area_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	CONSTRAINT "service_area_stops_service_area_id_stop_id_pk" PRIMARY KEY("service_area_id","stop_id")
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "service" "route_service" DEFAULT 'intercity' NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "service_area_id" uuid;--> statement-breakpoint
ALTER TABLE "network_settings" ADD CONSTRAINT "network_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_area_stops" ADD CONSTRAINT "service_area_stops_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_area_stops" ADD CONSTRAINT "service_area_stops_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_areas_name_key" ON "service_areas" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_service_area_check" CHECK (("routes"."service" = 'suburban') = ("routes"."service_area_id" is not null));