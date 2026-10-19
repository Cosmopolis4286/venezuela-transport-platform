-- Hand-edited before first use: drizzle-kit 0.31 omits the SRID, so "location" is set to geometry(point,4326).
CREATE TYPE "public"."currency" AS ENUM('USD', 'VES');--> statement-breakpoint
CREATE TYPE "public"."route_status" AS ENUM('draft', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."service_class" AS ENUM('standard', 'executive', 'sleeper');--> statement-breakpoint
CREATE TYPE "public"."stop_kind" AS ENUM('terminal', 'stop');--> statement-breakpoint
CREATE TABLE "route_fares" (
	"route_id" uuid NOT NULL,
	"from_stop_id" uuid NOT NULL,
	"to_stop_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	CONSTRAINT "route_fares_route_id_from_stop_id_to_stop_id_pk" PRIMARY KEY("route_id","from_stop_id","to_stop_id"),
	CONSTRAINT "route_fares_amount_check" CHECK ("route_fares"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "route_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"departure_time" time NOT NULL,
	"days_of_week" smallint[] NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date,
	"service_class" "service_class" NOT NULL,
	"seats" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "route_schedules_seats_check" CHECK ("route_schedules"."seats" between 1 and 100),
	CONSTRAINT "route_schedules_validity_check" CHECK ("route_schedules"."valid_until" is null or "route_schedules"."valid_until" >= "route_schedules"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "route_stops" (
	"route_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"sequence" smallint NOT NULL,
	"minutes_from_origin" integer NOT NULL,
	CONSTRAINT "route_stops_route_id_sequence_pk" PRIMARY KEY("route_id","sequence"),
	CONSTRAINT "route_stops_minutes_check" CHECK ("route_stops"."minutes_from_origin" >= 0)
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "route_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "stop_kind" NOT NULL,
	"name" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"address" text,
	"location" geometry(point,4326),
	"operator_organization_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "route_fares" ADD CONSTRAINT "route_fares_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_fares" ADD CONSTRAINT "route_fares_from_stop_id_stops_id_fk" FOREIGN KEY ("from_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_fares" ADD CONSTRAINT "route_fares_to_stop_id_stops_id_fk" FOREIGN KEY ("to_stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_schedules" ADD CONSTRAINT "route_schedules_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stops" ADD CONSTRAINT "stops_operator_organization_id_organizations_id_fk" FOREIGN KEY ("operator_organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "route_schedules_route_idx" ON "route_schedules" USING btree ("route_id");--> statement-breakpoint
CREATE UNIQUE INDEX "route_stops_route_stop_key" ON "route_stops" USING btree ("route_id","stop_id");--> statement-breakpoint
CREATE INDEX "route_stops_stop_idx" ON "route_stops" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "routes_organization_idx" ON "routes" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "stops_name_city_key" ON "stops" USING btree (lower("name"),lower("city"));--> statement-breakpoint
CREATE INDEX "stops_location_idx" ON "stops" USING gist ("location");