ALTER TABLE "trip_pack_products" ADD COLUMN "max_fare" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "trip_packs" ADD COLUMN "max_fare" numeric(12, 2);