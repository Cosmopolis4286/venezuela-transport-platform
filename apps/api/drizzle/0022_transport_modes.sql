CREATE TYPE "public"."transport_mode" AS ENUM('bus', 'car', 'motorcycle');--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "mode" "transport_mode";--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "mode" "transport_mode";--> statement-breakpoint
UPDATE "vehicles" SET "mode" = CASE WHEN "organizations"."type" = 'taxi_line' THEN 'car'::"transport_mode" ELSE 'bus'::"transport_mode" END FROM "organizations" WHERE "organizations"."id" = "vehicles"."organization_id";--> statement-breakpoint
UPDATE "routes" SET "mode" = CASE WHEN "organizations"."type" = 'taxi_line' THEN 'car'::"transport_mode" ELSE 'bus'::"transport_mode" END FROM "organizations" WHERE "organizations"."id" = "routes"."organization_id";--> statement-breakpoint
ALTER TABLE "vehicles" ALTER COLUMN "mode" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routes" ALTER COLUMN "mode" SET NOT NULL;
